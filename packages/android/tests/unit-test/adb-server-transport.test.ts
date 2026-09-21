import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { AdbServerClient } from '@yume-chan/adb';

const execFileAsync = promisify(execFile);
const rejectionFixturePath = path.resolve(
  __dirname,
  'fixtures/adb-server-transport-rejection.ts',
);

const connectedDevice = {
  serial: 'device',
  state: 'device',
  authenticating: false,
  transportId: 1n,
} satisfies AdbServerClient.Device;

function createMockAdbServerClient(): AdbServerClient {
  const connector = {
    connect() {
      throw new Error('Unexpected ADB server connection');
    },
    addReverseTunnel() {
      throw new Error('Unexpected reverse tunnel creation');
    },
    removeReverseTunnel() {
      throw new Error('Unexpected reverse tunnel removal');
    },
    clearReverseTunnels() {
      throw new Error('Unexpected reverse tunnel cleanup');
    },
  } satisfies AdbServerClient.ServerConnector;
  return new AdbServerClient(connector);
}

function mockConnectedDevice(client: AdbServerClient): void {
  rs.spyOn(client, 'getDeviceFeatures').mockResolvedValue({
    transportId: connectedDevice.transportId,
    features: [],
  });
  rs.spyOn(client, 'getDevices').mockResolvedValue([connectedDevice]);
}

describe('AdbServerClient.createTransport', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('preserves disconnect rejection semantics and aborts the monitor', async () => {
    const client = createMockAdbServerClient();
    const error = new Error('ExactReadable ended');
    let rejectDisconnect = (_reason: Error): void => {
      throw new Error('Disconnect monitor was not initialized');
    };
    let disconnectSignal: AdbServerClient.ServerConnectionOptions['signal'];

    mockConnectedDevice(client);
    rs.spyOn(client, 'waitForDisconnect').mockImplementation(
      (_transportId, options) => {
        disconnectSignal = options?.signal;
        return new Promise((_, reject) => {
          rejectDisconnect = reject;
        });
      },
    );

    const transport = await client.createTransport({ serial: 'device' });
    const rejection = expect(transport.disconnected).rejects.toBe(error);

    rejectDisconnect(error);

    await rejection;

    expect(disconnectSignal?.aborted).toBe(true);
  });

  it('does not leak the disconnect rejection to the Node.js process', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--unhandled-rejections=strict',
        '--import',
        'tsx',
        rejectionFixturePath,
      ],
      { cwd: path.resolve(__dirname, '../..') },
    );

    expect(stdout).toBe('');
  });

  it('aborts the disconnect monitor after the transport closes', async () => {
    const client = createMockAdbServerClient();
    let disconnectSignal: AdbServerClient.ServerConnectionOptions['signal'];

    mockConnectedDevice(client);
    rs.spyOn(client, 'waitForDisconnect').mockImplementation(
      (_transportId, options) => {
        disconnectSignal = options?.signal;
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(options.signal?.reason);
          });
        });
      },
    );

    const transport = await client.createTransport({ serial: 'device' });

    await transport.close();
    await expect(transport.disconnected).resolves.toBeUndefined();

    expect(disconnectSignal?.aborted).toBe(true);
  });
});
