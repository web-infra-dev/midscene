import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

const mocks = vi.hoisted(() => ({
  ensureStudioShellEnvHydrated: vi.fn(),
  getConnectedDevicesWithDetails: vi.fn(),
  getConnectedHarmonyDevices: vi.fn(),
  getConnectedDisplays: vi.fn(),
  execFile: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: mocks.execFile,
  };
});

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

function finishExecFile(
  args: unknown[],
  error: Error | null,
  stdout = '',
  stderr = '',
) {
  const callback = [...args]
    .reverse()
    .find((arg): arg is ExecFileCallback => typeof arg === 'function');
  callback?.(error, stdout, stderr);
  return {} as ReturnType<typeof import('node:child_process').execFile>;
}

import {
  DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS,
  discoverAllDevices,
} from '../src/main/playground/device-discovery';

describe('discoverAllDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mocks.ensureStudioShellEnvHydrated.mockReturnValue({
      applied: false,
      mutatedKeys: [],
      reason: 'not-packaged',
    });
    mocks.execFile.mockImplementation((...args) => {
      return finishExecFile(args, new Error('command not found'));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [
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
      ],
      errors: [],
    });

    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:${DEFAULT_WDA_PORT}/status`,
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.getConnectedHarmonyDevices).toHaveBeenCalledWith(undefined, {
      timeout: 5000,
    });
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

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [],
      errors: [],
    });
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

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [
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
      ],
      errors: [{ platformId: 'android', kind: 'toolchain-missing' }],
    });

    expect(mocks.debugLog).toHaveBeenCalledWith(
      'android scan failed:',
      expect.any(Error),
    );
    expect(mocks.debugLog).toHaveBeenCalledWith(
      'android cli fallback failed:',
      expect.any(Error),
    );
    expect(mocks.debugLog).toHaveBeenCalledWith(
      'ios scan failed:',
      expect.any(Error),
    );
  });

  it('treats successful empty Android and Harmony CLI probes as no-device states', async () => {
    mocks.getConnectedDevicesWithDetails.mockRejectedValue(
      new Error('appium adb probe failed'),
    );
    mocks.getConnectedHarmonyDevices.mockRejectedValue(
      new Error('hdc package probe failed'),
    );
    mocks.getConnectedDisplays.mockResolvedValue([]);
    vi.mocked(fetch).mockRejectedValue(new Error('connect ECONNREFUSED'));
    mocks.execFile.mockImplementation((_command, cliArgs, ...args) => {
      const [firstArg] = cliArgs as string[];
      if (firstArg === 'devices') {
        return finishExecFile(args, null, 'List of devices attached\n\n');
      }
      if (firstArg === 'list') {
        return finishExecFile(args, null, '[Empty]\n');
      }
      return finishExecFile(args, new Error('unexpected command'));
    });

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [],
      errors: [],
    });
  });

  it('uses direct adb output when the Android package probe fails but adb is available', async () => {
    mocks.getConnectedDevicesWithDetails.mockRejectedValue(
      new Error('appium adb probe failed'),
    );
    mocks.getConnectedHarmonyDevices.mockResolvedValue([]);
    mocks.getConnectedDisplays.mockResolvedValue([]);
    vi.mocked(fetch).mockRejectedValue(new Error('connect ECONNREFUSED'));
    mocks.execFile.mockImplementation((_command, cliArgs, ...args) => {
      const [firstArg] = cliArgs as string[];
      if (firstArg === 'devices') {
        return finishExecFile(
          args,
          null,
          [
            'List of devices attached',
            'emulator-5554 device product:sdk_gphone model:Pixel_8 device:emu',
            '',
          ].join('\n'),
        );
      }
      return finishExecFile(args, new Error('unexpected command'));
    });

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [
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
      ],
      errors: [],
    });
  });

  it('reports Harmony toolchain missing when package and CLI discovery fail', async () => {
    mocks.getConnectedDevicesWithDetails.mockResolvedValue([]);
    mocks.getConnectedHarmonyDevices.mockRejectedValue(
      new Error('HDC command timed out'),
    );
    mocks.getConnectedDisplays.mockResolvedValue([]);
    vi.mocked(fetch).mockRejectedValue(new Error('connect ECONNREFUSED'));
    mocks.execFile.mockImplementation((_command, cliArgs, ...args) => {
      const [firstArg] = cliArgs as string[];
      if (firstArg === 'list') {
        return finishExecFile(args, new Error('spawn hdc ENOENT'));
      }
      return finishExecFile(args, new Error('unexpected command'));
    });

    await expect(discoverAllDevices()).resolves.toEqual({
      devices: [],
      errors: [{ platformId: 'harmony', kind: 'toolchain-missing' }],
    });

    expect(mocks.getConnectedHarmonyDevices).toHaveBeenCalledWith(undefined, {
      timeout: 5000,
    });
    expect(mocks.debugLog).toHaveBeenCalledWith(
      'harmony cli fallback failed:',
      expect.any(Error),
    );
  });

  it('keeps discovery responsive when a platform probe never settles', async () => {
    vi.useFakeTimers();
    mocks.getConnectedDevicesWithDetails.mockResolvedValue([
      { udid: 'emulator-5554', label: 'Pixel 8', state: 'device' },
    ]);
    mocks.getConnectedHarmonyDevices.mockImplementation(
      () => new Promise(() => undefined),
    );
    mocks.getConnectedDisplays.mockResolvedValue([]);
    vi.mocked(fetch).mockRejectedValue(new Error('connect ECONNREFUSED'));

    const discovery = discoverAllDevices();
    await vi.advanceTimersByTimeAsync(DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS);

    await expect(discovery).resolves.toEqual({
      devices: [
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
      ],
      errors: [{ platformId: 'harmony', kind: 'toolchain-missing' }],
    });

    expect(mocks.debugLog).toHaveBeenCalledWith(
      `harmony scan timed out after ${DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS}ms`,
    );
  });
});
