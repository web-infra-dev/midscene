import { AdbServerClient } from '@yume-chan/adb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdbServerTransport } from '../../src/adb-server-transport';

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
  } satisfies AdbServerClient.ServerConnector;
  return new AdbServerClient(connector);
}

function mockConnectedDevice(client: AdbServerClient): void {
  vi.spyOn(client, 'getDeviceFeatures').mockResolvedValue({
    transportId: connectedDevice.transportId,
    features: [],
  });
  vi.spyOn(client, 'getDevices').mockResolvedValue([connectedDevice]);
}

describe('createAdbServerTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles disconnect monitor failures without changing rejection semantics', async () => {
    const client = createMockAdbServerClient();
    const error = new Error('ExactReadable ended');
    let rejectDisconnect = (_reason: Error): void => {
      throw new Error('Disconnect monitor was not initialized');
    };
    let disconnectSignal: AdbServerClient.ServerConnectionOptions['signal'];

    mockConnectedDevice(client);
    vi.spyOn(client, 'waitForDisconnect').mockImplementation(
      (_transportId, options) => {
        disconnectSignal = options?.signal;
        return new Promise((_, reject) => {
          rejectDisconnect = reject;
        });
      },
    );

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const transport = await createAdbServerTransport(client, {
        serial: 'device',
      });
      const rejection = expect(transport.disconnected).rejects.toBe(error);

      rejectDisconnect(error);

      await rejection;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(disconnectSignal?.aborted).toBe(true);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('aborts the disconnect monitor after the transport closes', async () => {
    const client = createMockAdbServerClient();
    let disconnectSignal: AdbServerClient.ServerConnectionOptions['signal'];

    mockConnectedDevice(client);
    vi.spyOn(client, 'waitForDisconnect').mockImplementation(
      (_transportId, options) => {
        disconnectSignal = options?.signal;
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(options.signal?.reason);
          });
        });
      },
    );

    const transport = await createAdbServerTransport(client, {
      serial: 'device',
    });

    await transport.close();
    await expect(transport.disconnected).resolves.toBeUndefined();

    expect(disconnectSignal?.aborted).toBe(true);
  });

  it('throws when the device disappears during transport creation', async () => {
    const client = createMockAdbServerClient();
    vi.spyOn(client, 'getDeviceFeatures').mockResolvedValue({
      transportId: 1n,
      features: [],
    });
    vi.spyOn(client, 'getDevices').mockResolvedValue([]);
    const waitForDisconnect = vi.spyOn(client, 'waitForDisconnect');

    await expect(
      createAdbServerTransport(client, { serial: 'device' }),
    ).rejects.toThrow(
      'Failed to create ADB transport: device with transport ID 1 is no longer connected',
    );
    expect(waitForDisconnect).not.toHaveBeenCalled();
  });
});
