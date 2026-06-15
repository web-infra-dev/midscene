import type { AdbServerClient } from '@yume-chan/adb';
import { describe, expect, it, vi } from 'vitest';
import { installAdbServerClientTransportIdFeatures } from '../../src/internal/adb-server-client-transport-id-features';

const targetDevice: AdbServerClient.Device = {
  serial: 'target-device',
  state: 'device',
  authenticating: false,
  transportId: 42n,
};

function createConnection(featuresString = 'shell_v2,cmd') {
  return {
    readString: vi.fn().mockResolvedValue(featuresString),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

describe('installAdbServerClientTransportIdFeatures', () => {
  it('uses a transport-id qualified features request for serial selectors', async () => {
    const connection = createConnection();
    const client = {
      getDeviceFeatures: vi.fn(),
      getDevices: vi.fn().mockResolvedValue([targetDevice]),
      createConnection: vi.fn().mockResolvedValue(connection),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(
      client.getDeviceFeatures({ serial: 'target-device' }),
    ).resolves.toEqual({
      transportId: 42n,
      features: ['shell_v2', 'cmd'],
    });
    expect(client.getDevices).toHaveBeenCalledTimes(1);
    expect(originalGetDeviceFeatures).not.toHaveBeenCalled();
    expect(client.createConnection).toHaveBeenCalledWith(
      'host-transport-id:42:features',
    );
    expect(connection.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses an existing transportId selector without resolving the device list', async () => {
    const connection = createConnection('abb_exec');
    const client = {
      getDeviceFeatures: vi.fn(),
      getDevices: vi.fn(),
      createConnection: vi.fn().mockResolvedValue(connection),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(
      client.getDeviceFeatures({ transportId: 42n }),
    ).resolves.toEqual({
      transportId: 42n,
      features: ['abb_exec'],
    });
    expect(client.getDevices).not.toHaveBeenCalled();
    expect(originalGetDeviceFeatures).not.toHaveBeenCalled();
    expect(client.createConnection).toHaveBeenCalledWith(
      'host-transport-id:42:features',
    );
  });

  it('does not wrap the same client more than once', () => {
    const client = {
      getDeviceFeatures: vi.fn(),
      getDevices: vi.fn(),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;

    installAdbServerClientTransportIdFeatures(client);
    const installedGetDeviceFeatures = client.getDeviceFeatures;
    installAdbServerClientTransportIdFeatures(client);

    expect(client.getDeviceFeatures).toBe(installedGetDeviceFeatures);
  });

  it('delegates non-deterministic selectors to the original implementation', async () => {
    const originalFeatures = {
      transportId: 42n,
      features: ['shell_v2'],
    };
    const client = {
      getDeviceFeatures: vi.fn().mockResolvedValue(originalFeatures),
      getDevices: vi.fn().mockResolvedValue([targetDevice]),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(client.getDeviceFeatures({ usb: true })).resolves.toBe(
      originalFeatures,
    );
    expect(originalGetDeviceFeatures).toHaveBeenCalledWith({ usb: true });
    expect(client.getDevices).not.toHaveBeenCalled();
    expect(client.createConnection).not.toHaveBeenCalled();
  });

  it('delegates serial selectors when the serial cannot be resolved', async () => {
    const originalFeatures = {
      transportId: 7n,
      features: ['cmd'],
    };
    const client = {
      getDeviceFeatures: vi.fn().mockResolvedValue(originalFeatures),
      getDevices: vi.fn().mockResolvedValue([
        {
          ...targetDevice,
          serial: 'other-device',
        },
      ]),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(
      client.getDeviceFeatures({ serial: 'target-device' }),
    ).resolves.toBe(originalFeatures);
    expect(client.getDevices).toHaveBeenCalledTimes(1);
    expect(originalGetDeviceFeatures).toHaveBeenCalledWith({
      serial: 'target-device',
    });
    expect(client.createConnection).not.toHaveBeenCalled();
  });

  it('delegates serial selectors when resolving devices fails', async () => {
    const originalFeatures = {
      transportId: 7n,
      features: ['cmd'],
    };
    const client = {
      getDeviceFeatures: vi.fn().mockResolvedValue(originalFeatures),
      getDevices: vi.fn().mockRejectedValue(new Error('adb disconnected')),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(
      client.getDeviceFeatures({ serial: 'target-device' }),
    ).resolves.toBe(originalFeatures);
    expect(originalGetDeviceFeatures).toHaveBeenCalledWith({
      serial: 'target-device',
    });
    expect(client.createConnection).not.toHaveBeenCalled();
  });

  it('preserves original implementation errors for delegated selectors', async () => {
    const originalError = new Error('device offline');
    const client = {
      getDeviceFeatures: vi.fn().mockRejectedValue(originalError),
      getDevices: vi.fn(),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;

    installAdbServerClientTransportIdFeatures(client);

    await expect(client.getDeviceFeatures({ usb: true })).rejects.toBe(
      originalError,
    );
    expect(client.getDevices).not.toHaveBeenCalled();
    expect(client.createConnection).not.toHaveBeenCalled();
  });

  it('propagates transport-id qualified feature request errors', async () => {
    const transportError = new Error('transport closed');
    const client = {
      getDeviceFeatures: vi.fn(),
      getDevices: vi.fn(),
      createConnection: vi.fn().mockRejectedValue(transportError),
    } as unknown as AdbServerClient;

    installAdbServerClientTransportIdFeatures(client);

    await expect(client.getDeviceFeatures({ transportId: 42n })).rejects.toBe(
      transportError,
    );
    expect(client.getDevices).not.toHaveBeenCalled();
  });

  it('disposes the feature connection when reading features fails', async () => {
    const readError = new Error('read failed');
    const connection = {
      readString: vi.fn().mockRejectedValue(readError),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      getDeviceFeatures: vi.fn(),
      getDevices: vi.fn(),
      createConnection: vi.fn().mockResolvedValue(connection),
    } as unknown as AdbServerClient;

    installAdbServerClientTransportIdFeatures(client);

    await expect(client.getDeviceFeatures({ transportId: 42n })).rejects.toBe(
      readError,
    );
    expect(connection.dispose).toHaveBeenCalledTimes(1);
  });

  it('delegates undefined selectors to the original implementation', async () => {
    const originalFeatures = {
      transportId: 42n,
      features: ['shell_v2'],
    };
    const client = {
      getDeviceFeatures: vi.fn().mockResolvedValue(originalFeatures),
      getDevices: vi.fn(),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;
    const originalGetDeviceFeatures = client.getDeviceFeatures;

    installAdbServerClientTransportIdFeatures(client);

    await expect(client.getDeviceFeatures(undefined)).resolves.toBe(
      originalFeatures,
    );
    expect(originalGetDeviceFeatures).toHaveBeenCalledWith(undefined);
    expect(client.createConnection).not.toHaveBeenCalled();
  });
});
