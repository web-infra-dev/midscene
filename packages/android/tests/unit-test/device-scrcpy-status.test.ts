import { afterEach, describe, expect, it, vi } from 'vitest';
import { AndroidDevice } from '../../src/device';
import { ScrcpyDeviceAdapter } from '../../src/scrcpy-device-adapter';

const deviceInfo = {
  physicalWidth: 1080,
  physicalHeight: 1920,
  dpr: 3,
  orientation: 0,
};

describe('AndroidDevice scrcpy recovery API', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('should pause scrcpy before a network-changing shell command', async () => {
    const order: string[] = [];
    const shell = vi.fn().mockImplementation(async () => {
      order.push('shell');
      return '';
    });
    const pauseForAdbCommand = vi.fn().mockImplementation(async () => {
      order.push('pause');
      return {
        reason: 'network-state-change',
        wasConnected: true,
        pausedUntil: Date.now() + 10_000,
        diagnostics: { connected: true, totalPackets: 10 },
      };
    });
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: true },
    });
    (device as any).adb = {
      executable: { path: '/mock/adb' },
      shell,
    };
    (device as any).scrcpyAdapter = {
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        connected: true,
        lastError: null,
        retryAfter: null,
      }),
      pauseForAdbCommand,
    };

    const adb = await device.getAdb();
    await adb.shell('svc wifi disable && svc data disable');

    expect(order).toEqual(['pause', 'shell']);
    expect(pauseForAdbCommand).toHaveBeenCalledWith(
      'network-state-change',
      10_000,
    );
  });

  it('should recognize array-form network commands', async () => {
    const shell = vi.fn().mockResolvedValue('');
    const pauseForAdbCommand = vi.fn().mockResolvedValue({
      reason: 'network-state-change',
      wasConnected: true,
      pausedUntil: Date.now() + 10_000,
      diagnostics: null,
    });
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: true },
    });
    (device as any).adb = {
      executable: { path: '/mock/adb' },
      shell,
    };
    (device as any).scrcpyAdapter = {
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        connected: true,
        lastError: null,
        retryAfter: null,
      }),
      pauseForAdbCommand,
    };

    const adb = await device.getAdb();
    await adb.shell(['svc', 'wifi', 'enable']);

    expect(pauseForAdbCommand).toHaveBeenCalledOnce();
  });

  it('should not pause scrcpy before an unrelated shell command', async () => {
    const shell = vi.fn().mockResolvedValue('ok');
    const pauseForAdbCommand = vi.fn();
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: true },
    });
    (device as any).adb = {
      executable: { path: '/mock/adb' },
      shell,
    };
    (device as any).scrcpyAdapter = {
      getStatus: vi.fn().mockReturnValue({
        enabled: true,
        connected: true,
        lastError: null,
        retryAfter: null,
      }),
      pauseForAdbCommand,
    };

    const adb = await device.getAdb();
    await adb.shell('getprop ro.product.model');

    expect(pauseForAdbCommand).not.toHaveBeenCalled();
    expect(shell).toHaveBeenCalledOnce();
  });

  it('should not add network-command overhead when scrcpy is disabled', async () => {
    const shell = vi.fn().mockResolvedValue('');
    const pauseForAdbCommand = vi.fn();
    const device = new AndroidDevice('device', {
      scrcpyConfig: { enabled: false },
    });
    (device as any).adb = {
      executable: { path: '/mock/adb' },
      shell,
    };
    (device as any).scrcpyAdapter = {
      getStatus: vi.fn().mockReturnValue({
        enabled: false,
        connected: false,
        lastError: null,
        retryAfter: null,
      }),
      pauseForAdbCommand,
    };

    const adb = await device.getAdb();
    await adb.shell('svc wifi disable');

    expect(pauseForAdbCommand).not.toHaveBeenCalled();
    expect(shell).toHaveBeenCalledOnce();
  });

  it('should disconnect an active stream and temporarily disable scrcpy', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));
    const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
    const manager = {
      isConnected: vi.fn().mockReturnValue(true),
      getDiagnostics: vi.fn().mockReturnValue({
        connected: true,
        totalPackets: 42,
        lastPacketAgeMs: 25,
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    (adapter as any).manager = manager;

    const result = await adapter.pauseForAdbCommand(
      'network-state-change',
      10_000,
    );

    expect(manager.disconnect).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      reason: 'network-state-change',
      wasConnected: true,
      pausedUntil: Date.now() + 10_000,
      diagnostics: {
        connected: true,
        totalPackets: 42,
        lastPacketAgeMs: 25,
      },
    });
    expect(adapter.isEnabled()).toBe(false);
    expect(adapter.getStatus()).toMatchObject({
      enabled: true,
      connected: false,
      lastError: null,
      retryAfter: Date.now() + 10_000,
    });

    vi.advanceTimersByTime(10_000);
    expect(adapter.isEnabled()).toBe(true);
  });

  it('should preserve a longer failure cooldown while scrcpy is paused', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));
    const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
    (adapter as any).retryAfter = Date.now() + 60_000;

    await adapter.pauseForAdbCommand('network-state-change', 10_000);

    expect(adapter.getStatus().retryAfter).toBe(Date.now() + 60_000);
  });
});
