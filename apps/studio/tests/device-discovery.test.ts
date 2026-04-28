import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureStudioShellEnvHydrated: vi.fn(),
  getConnectedDevicesWithDetails: vi.fn(),
  getConnectedHarmonyDevices: vi.fn(),
  getConnectedDisplays: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('@midscene/android', () => ({
  getConnectedDevicesWithDetails: mocks.getConnectedDevicesWithDetails,
}));

vi.mock('@midscene/harmony', () => ({
  getConnectedDevices: mocks.getConnectedHarmonyDevices,
}));

vi.mock('@midscene/computer', () => ({
  getConnectedDisplays: mocks.getConnectedDisplays,
}));

vi.mock('@midscene/shared/logger', () => ({
  getDebug: () => mocks.debugLog,
}));

vi.mock('../src/main/shell-env', () => ({
  ensureStudioShellEnvHydrated: mocks.ensureStudioShellEnvHydrated,
}));

import { discoverAllDevices } from '../src/main/playground/device-discovery';

describe('discoverAllDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mocks.ensureStudioShellEnvHydrated.mockReturnValue({
      applied: false,
      mutatedKeys: [],
      reason: 'not-packaged',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aggregates discovered devices across Android, iOS, Harmony, and Computer', async () => {
    mocks.getConnectedDevicesWithDetails.mockResolvedValue([
      { udid: 'emulator-5554', label: 'Pixel 8', state: 'device' },
    ]);
    mocks.getConnectedHarmonyDevices.mockResolvedValue([
      { deviceId: 'harmony-001' },
    ]);
    mocks.getConnectedDisplays.mockResolvedValue([
      { id: 1, name: 'Studio Display', primary: true },
      { id: 2, name: '', primary: false },
    ]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        value: {
          device: 'iPhone 15',
          os: { version: '17.5' },
          ready: true,
        },
      }),
    } as Response);

    await expect(discoverAllDevices()).resolves.toEqual([
      {
        platformId: 'android',
        id: 'emulator-5554',
        label: 'Pixel 8',
        description: 'ADB: emulator-5554',
        status: 'device',
        sessionValues: {
          deviceId: 'emulator-5554',
        },
      },
      {
        platformId: 'ios',
        id: `localhost:${DEFAULT_WDA_PORT}`,
        label: 'iOS (iPhone 15)',
        description: `WebDriverAgent: localhost:${DEFAULT_WDA_PORT} · iOS 17.5`,
        status: 'device',
        sessionValues: {
          host: 'localhost',
          port: DEFAULT_WDA_PORT,
        },
      },
      {
        platformId: 'harmony',
        id: 'harmony-001',
        label: 'harmony-001',
        description: 'HDC: harmony-001',
        status: 'device',
        sessionValues: {
          deviceId: 'harmony-001',
        },
      },
      {
        platformId: 'computer',
        id: '1',
        label: 'Studio Display',
        description: 'Primary display',
        status: 'device',
        sessionValues: {
          displayId: '1',
        },
      },
      {
        platformId: 'computer',
        id: '2',
        label: 'Display 2',
        description: undefined,
        status: 'device',
        sessionValues: {
          displayId: '2',
        },
      },
    ]);

    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:${DEFAULT_WDA_PORT}/status`,
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('skips the iOS WDA shortcut when the endpoint is reachable but not ready', async () => {
    mocks.getConnectedDevicesWithDetails.mockResolvedValue([]);
    mocks.getConnectedHarmonyDevices.mockResolvedValue([]);
    mocks.getConnectedDisplays.mockResolvedValue([]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        value: {
          ready: false,
        },
      }),
    } as Response);

    await expect(discoverAllDevices()).resolves.toEqual([]);
  });

  it('keeps successful platform scans when other discovery probes fail', async () => {
    mocks.getConnectedDevicesWithDetails.mockRejectedValue(
      new Error('adb unavailable'),
    );
    mocks.getConnectedHarmonyDevices.mockResolvedValue([
      { deviceId: 'harmony-001' },
    ]);
    mocks.getConnectedDisplays.mockResolvedValue([
      { id: 9, name: 'External Monitor', primary: false },
    ]);
    vi.mocked(fetch).mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(discoverAllDevices()).resolves.toEqual([
      {
        platformId: 'harmony',
        id: 'harmony-001',
        label: 'harmony-001',
        description: 'HDC: harmony-001',
        status: 'device',
        sessionValues: {
          deviceId: 'harmony-001',
        },
      },
      {
        platformId: 'computer',
        id: '9',
        label: 'External Monitor',
        description: undefined,
        status: 'device',
        sessionValues: {
          displayId: '9',
        },
      },
    ]);

    expect(mocks.debugLog).toHaveBeenCalledWith(
      'android scan failed:',
      expect.any(Error),
    );
    expect(mocks.debugLog).toHaveBeenCalledWith(
      'ios scan failed:',
      expect.any(Error),
    );
  });
});
