import type { AdbServerClient } from '@yume-chan/adb';
import { describe, expect, it, vi } from 'vitest';
import { installAdbServerClientFeaturesFallback } from '../../src/adb-server-client-features-fallback';

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

describe('installAdbServerClientFeaturesFallback', () => {
  it('falls back to a transport-id qualified features request for the multi-device ADB server bug', async () => {
    const connection = createConnection();
    const client = {
      getDeviceFeatures: vi
        .fn()
        .mockRejectedValue(new Error('more than one device/emulator')),
      getDevices: vi.fn().mockResolvedValue([targetDevice]),
      createConnection: vi.fn().mockResolvedValue(connection),
    } as unknown as AdbServerClient;

    installAdbServerClientFeaturesFallback(client);

    await expect(
      client.getDeviceFeatures({ serial: 'target-device' }),
    ).resolves.toEqual({
      transportId: 42n,
      features: ['shell_v2', 'cmd'],
    });
    expect(client.getDevices).toHaveBeenCalledTimes(1);
    expect(client.createConnection).toHaveBeenCalledWith(
      'host-transport-id:42:features',
    );
    expect(connection.dispose).toHaveBeenCalledTimes(1);
  });

  it('preserves the original error when the selector cannot be resolved deterministically', async () => {
    const originalError = new Error('more than one device/emulator');
    const client = {
      getDeviceFeatures: vi.fn().mockRejectedValue(originalError),
      getDevices: vi.fn().mockResolvedValue([targetDevice]),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;

    installAdbServerClientFeaturesFallback(client);

    await expect(client.getDeviceFeatures({ usb: true })).rejects.toBe(
      originalError,
    );
    expect(client.getDevices).not.toHaveBeenCalled();
    expect(client.createConnection).not.toHaveBeenCalled();
  });

  it('does not fallback for unrelated getDeviceFeatures errors', async () => {
    const originalError = new Error('device offline');
    const client = {
      getDeviceFeatures: vi.fn().mockRejectedValue(originalError),
      getDevices: vi.fn(),
      createConnection: vi.fn(),
    } as unknown as AdbServerClient;

    installAdbServerClientFeaturesFallback(client);

    await expect(
      client.getDeviceFeatures({ serial: 'target-device' }),
    ).rejects.toBe(originalError);
    expect(client.getDevices).not.toHaveBeenCalled();
    expect(client.createConnection).not.toHaveBeenCalled();
  });
});
