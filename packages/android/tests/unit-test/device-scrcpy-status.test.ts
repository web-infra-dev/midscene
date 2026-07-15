import { describe, expect, it, vi } from 'vitest';
import { AndroidDevice } from '../../src/device';

const deviceInfo = {
  physicalWidth: 1080,
  physicalHeight: 1920,
  dpr: 3,
  orientation: 0,
};

describe('AndroidDevice scrcpy recovery API', () => {
  it('should expose scrcpy status from the device adapter', () => {
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: true },
    });
    const status = {
      enabled: true,
      connected: false,
      lastError: 'codec not ready',
      retryAfter: Date.now() + 5_000,
    };
    (device as any).scrcpyAdapter = {
      getStatus: vi.fn().mockReturnValue(status),
    };

    expect(device.getScrcpyStatus()).toBe(status);
  });

  it('should retry scrcpy on the same AndroidDevice instance', async () => {
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: true },
    });
    const status = {
      enabled: true,
      connected: true,
      lastError: null,
      retryAfter: null,
    };
    const adapter = {
      isEnabled: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(status),
    };
    (device as any).scrcpyAdapter = adapter;
    (device as any).getDevicePhysicalInfo = vi
      .fn()
      .mockResolvedValue(deviceInfo);

    await expect(device.retryScrcpy()).resolves.toBe(status);
    expect(adapter.initialize).toHaveBeenCalledWith(deviceInfo);
  });

  it('should reject explicit retries when scrcpy is disabled', async () => {
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: false },
    });

    await expect(device.retryScrcpy()).rejects.toThrow('scrcpy is disabled');
  });
});
