import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import type {
  DiscoverDevicesResult,
  DiscoveredDevice,
  PlatformDiscoveryError,
  StudioPlatformId,
} from '@shared/electron-contract';
import { ensureStudioShellEnvHydrated } from '../shell-env';

interface PlatformScanResult {
  devices: DiscoveredDevice[];
  error?: PlatformDiscoveryError;
}

function emptyDiscoveryResult(): DiscoverDevicesResult {
  return { devices: [], errors: [] };
}

function toolchainMissing(
  platformId: StudioPlatformId,
): PlatformDiscoveryError {
  return { platformId, kind: 'toolchain-missing' };
}

const debugLog = getDebug('studio:device-discovery', { console: true });
const IOS_WDA_DISCOVERY_HOST = 'localhost';
const IOS_WDA_DISCOVERY_TIMEOUT_MS = 1000;
const DEVICE_CLI_DISCOVERY_TIMEOUT_MS = 5000;
export const DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS = 10_000;
export const DEVICE_DISCOVERY_POLL_INTERVAL_MS = 5000;
const execFileAsync = promisify(execFile);

export interface DeviceDiscoveryService {
  close(): void;
  getSnapshot(options?: {
    forceRefresh?: boolean;
  }): Promise<DiscoverDevicesResult>;
  setPollingPaused(paused: boolean): void;
  subscribe(listener: (devices: DiscoverDevicesResult) => void): () => void;
}

interface CreateDeviceDiscoveryServiceOptions {
  clearIntervalFn?: typeof globalThis.clearInterval;
  discoverDevices?: () => Promise<DiscoverDevicesResult>;
  intervalMs?: number;
  setIntervalFn?: typeof globalThis.setInterval;
}

interface WDAStatusResponse {
  value?: {
    device?: string;
    os?: {
      version?: string;
    };
    ready?: boolean;
  };
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter(isString)));
}

function getPlatformExecutableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

async function execFirstAvailable(
  candidates: string[],
  args: string[],
): Promise<string> {
  let lastError: unknown;

  for (const candidate of uniqueStrings(candidates)) {
    try {
      const result = (await execFileAsync(candidate, args, {
        encoding: 'utf8',
        timeout: DEVICE_CLI_DISCOVERY_TIMEOUT_MS,
        windowsHide: true,
      })) as string | { stdout: string };
      const stdout = typeof result === 'string' ? result : result.stdout;
      return stdout;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No executable candidate provided');
}

function resolveAdbCandidates(): string[] {
  const adbName = getPlatformExecutableName('adb');
  return uniqueStrings([
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, 'platform-tools', adbName)
      : undefined,
    process.env.ANDROID_SDK_ROOT
      ? path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbName)
      : undefined,
    adbName,
  ]);
}

function resolveHdcCandidates(): string[] {
  const hdcName = getPlatformExecutableName('hdc');
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return uniqueStrings([
    process.env.HDC_HOME ? path.join(process.env.HDC_HOME, hdcName) : undefined,
    homeDir
      ? path.join(
          homeDir,
          'Library/HarmonyOS/next/command-line-tools/sdk/default/openharmony/toolchains',
          hdcName,
        )
      : undefined,
    homeDir
      ? path.join(
          homeDir,
          'Library/HarmonyOS/sdk/hmscore/3.1.0/toolchains',
          hdcName,
        )
      : undefined,
    hdcName,
  ]);
}

function parseAdbDevices(stdout: string): DiscoveredDevice[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('List of devices') &&
        !line.startsWith('* daemon'),
    )
    .map((line) => {
      const parts = line.split(/\s+/);
      const udid = parts[0];
      const status = parts[1] || 'unknown';
      const model = line.match(/\bmodel:([^\s]+)/)?.[1]?.replace(/_/g, ' ');
      return {
        platformId: 'android' as const,
        id: udid,
        label: model || udid,
        description: `ADB: ${udid}`,
        status,
        sessionValues: {
          deviceId: udid,
        },
      };
    })
    .filter((device) => Boolean(device.id));
}

function parseHdcTargets(stdout: string): DiscoveredDevice[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('[') &&
        line.toLowerCase() !== 'empty' &&
        line.toLowerCase() !== '[empty]',
    )
    .map((deviceId) => ({
      platformId: 'harmony' as const,
      id: deviceId,
      label: deviceId,
      description: `HDC: ${deviceId}`,
      status: 'device',
      sessionValues: {
        deviceId,
      },
    }));
}

async function scanAndroidDevicesFromCli(): Promise<PlatformScanResult> {
  const stdout = await execFirstAvailable(resolveAdbCandidates(), [
    'devices',
    '-l',
  ]);
  return { devices: parseAdbDevices(stdout) };
}

async function scanHarmonyDevicesFromCli(): Promise<PlatformScanResult> {
  const stdout = await execFirstAvailable(resolveHdcCandidates(), [
    'list',
    'targets',
  ]);
  return { devices: parseHdcTargets(stdout) };
}

function timeoutScanResult(platformId: StudioPlatformId): PlatformScanResult {
  if (platformId === 'android' || platformId === 'harmony') {
    return { devices: [], error: toolchainMissing(platformId) };
  }
  return { devices: [] };
}

async function withPlatformDiscoveryTimeout(
  platformId: StudioPlatformId,
  scan: Promise<PlatformScanResult>,
): Promise<PlatformScanResult> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<PlatformScanResult>((resolve) => {
    timeoutId = setTimeout(() => {
      debugLog(
        `${platformId} scan timed out after ${DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS}ms`,
      );
      resolve(timeoutScanResult(platformId));
    }, DEVICE_PLATFORM_DISCOVERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([scan, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function buildIOSDiscoveryLabel(status: WDAStatusResponse): string {
  const device = status.value?.device;
  if (isString(device)) {
    return `iOS (${device})`;
  }
  return 'iOS via WDA';
}

function buildIOSDiscoveryDescription(
  host: string,
  port: number,
  status: WDAStatusResponse,
): string {
  const details = [`WebDriverAgent: ${host}:${port}`];
  const osVersion = status.value?.os?.version;
  if (isString(osVersion)) {
    details.push(`iOS ${osVersion}`);
  }
  return details.join(' · ');
}

export function createDeviceDiscoveryService({
  clearIntervalFn = globalThis.clearInterval,
  discoverDevices = discoverAllDevices,
  intervalMs = DEVICE_DISCOVERY_POLL_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
}: CreateDeviceDiscoveryServiceOptions = {}): DeviceDiscoveryService {
  let currentSnapshot: DiscoverDevicesResult = emptyDiscoveryResult();
  let currentSignature = JSON.stringify(currentSnapshot);
  let hasSnapshot = false;
  let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;
  let paused = false;
  let refreshPromise: Promise<DiscoverDevicesResult> | null = null;
  let started = false;
  const listeners = new Set<(devices: DiscoverDevicesResult) => void>();

  const stopPolling = () => {
    if (intervalId !== null) {
      clearIntervalFn(intervalId);
      intervalId = null;
    }
  };

  const notifyListeners = (devices: DiscoverDevicesResult) => {
    listeners.forEach((listener) => {
      try {
        listener(devices);
      } catch (error) {
        debugLog('device discovery listener failed:', error);
      }
    });
  };

  const refreshSnapshot = async (): Promise<DiscoverDevicesResult> => {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const nextSnapshot = await discoverDevices();
      const nextSignature = JSON.stringify(nextSnapshot);
      currentSnapshot = nextSnapshot;
      hasSnapshot = true;
      if (nextSignature !== currentSignature) {
        currentSignature = nextSignature;
        notifyListeners(nextSnapshot);
      }
      return nextSnapshot;
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  };

  const ensurePolling = () => {
    if (paused || intervalId !== null) {
      return;
    }

    intervalId = setIntervalFn(() => {
      void refreshSnapshot().catch((error) => {
        debugLog('device discovery refresh failed:', error);
      });
    }, intervalMs);
  };

  const ensureStarted = () => {
    if (started) {
      return;
    }

    started = true;
    void refreshSnapshot().catch((error) => {
      debugLog('initial device discovery refresh failed:', error);
    });
    ensurePolling();
  };

  return {
    close() {
      stopPolling();
      listeners.clear();
    },
    async getSnapshot(options) {
      ensureStarted();
      if (options?.forceRefresh || !hasSnapshot) {
        return refreshSnapshot();
      }
      return currentSnapshot;
    },
    setPollingPaused(nextPaused) {
      ensureStarted();
      if (paused === nextPaused) {
        return;
      }

      paused = nextPaused;
      if (paused) {
        stopPolling();
        return;
      }

      void refreshSnapshot().catch((error) => {
        debugLog('device discovery resume refresh failed:', error);
      });
      ensurePolling();
    },
    subscribe(listener) {
      listeners.add(listener);
      ensureStarted();
      if (hasSnapshot) {
        listener(currentSnapshot);
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Scan all platforms for connected devices. Each platform's scan is
 * independent — a failure on one platform (e.g. `hdc` not installed)
 * does not prevent others from returning results.
 *
 * iOS discovery is a local convenience probe only: if WebDriverAgent is
 * already reachable on the default loopback endpoint, surface it as a
 * clickable target so Studio can prefill the iOS setup form.
 */
export async function discoverAllDevices(): Promise<DiscoverDevicesResult> {
  const scans = await Promise.allSettled([
    withPlatformDiscoveryTimeout('android', scanAndroidDevices()),
    withPlatformDiscoveryTimeout('ios', scanIOSDevices()),
    withPlatformDiscoveryTimeout('harmony', scanHarmonyDevices()),
    withPlatformDiscoveryTimeout('computer', scanComputerDisplays()),
  ]);

  const devices: DiscoveredDevice[] = [];
  const errors: PlatformDiscoveryError[] = [];
  for (const scan of scans) {
    if (scan.status === 'fulfilled') {
      devices.push(...scan.value.devices);
      if (scan.value.error) {
        errors.push(scan.value.error);
      }
    } else {
      debugLog('platform scan rejected:', scan.reason);
    }
  }

  return { devices, errors };
}

async function scanAndroidDevices(): Promise<PlatformScanResult> {
  try {
    ensureStudioShellEnvHydrated();
    const { getConnectedDevicesWithDetails } = await import(
      '@midscene/android'
    );
    const devices = await getConnectedDevicesWithDetails();
    return {
      devices: devices.map((device) => ({
        platformId: 'android',
        id: device.udid,
        label: (device as { label?: string }).label || device.udid,
        description: `ADB: ${device.udid}`,
        status: device.state,
        sessionValues: {
          deviceId: device.udid,
        },
      })),
    };
  } catch (err) {
    debugLog('android scan failed:', err);
    try {
      return await scanAndroidDevicesFromCli();
    } catch (fallbackError) {
      debugLog('android cli fallback failed:', fallbackError);
      return { devices: [], error: toolchainMissing('android') };
    }
  }
}

async function scanIOSDevices(): Promise<PlatformScanResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, IOS_WDA_DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `http://${IOS_WDA_DISCOVERY_HOST}:${DEFAULT_WDA_PORT}/status`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { devices: [] };
    }

    const status = (await response.json()) as WDAStatusResponse;
    if (status.value?.ready !== true) {
      return { devices: [] };
    }

    return {
      devices: [
        {
          platformId: 'ios',
          id: `${IOS_WDA_DISCOVERY_HOST}:${DEFAULT_WDA_PORT}`,
          label: buildIOSDiscoveryLabel(status),
          description: buildIOSDiscoveryDescription(
            IOS_WDA_DISCOVERY_HOST,
            DEFAULT_WDA_PORT,
            status,
          ),
          status: 'device',
          sessionValues: {
            host: IOS_WDA_DISCOVERY_HOST,
            port: DEFAULT_WDA_PORT,
          },
        },
      ],
    };
  } catch (err) {
    // iOS WDA probe failing just means no local WDA is running. That is
    // the dominant case (no developer has WDA up by default), not a
    // toolchain problem — do not surface it as an error to the UI.
    debugLog('ios scan failed:', err);
    return { devices: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scanHarmonyDevices(): Promise<PlatformScanResult> {
  try {
    ensureStudioShellEnvHydrated();
    const { getConnectedDevices } = await import('@midscene/harmony');
    const devices = await getConnectedDevices(undefined, {
      timeout: DEVICE_CLI_DISCOVERY_TIMEOUT_MS,
    });
    return {
      devices: devices.map((device) => ({
        platformId: 'harmony',
        id: device.deviceId,
        label: device.deviceId,
        description: `HDC: ${device.deviceId}`,
        status: 'device',
        sessionValues: {
          deviceId: device.deviceId,
        },
      })),
    };
  } catch (err) {
    debugLog('harmony scan failed:', err);
    try {
      return await scanHarmonyDevicesFromCli();
    } catch (fallbackError) {
      debugLog('harmony cli fallback failed:', fallbackError);
      return { devices: [], error: toolchainMissing('harmony') };
    }
  }
}

async function scanComputerDisplays(): Promise<PlatformScanResult> {
  try {
    const { getConnectedDisplays } = await import('@midscene/computer');
    const displays = await getConnectedDisplays();
    return {
      devices: displays.map((display) => ({
        platformId: 'computer',
        id: String(display.id),
        label: display.name || `Display ${display.id}`,
        description: display.primary ? 'Primary display' : undefined,
        status: 'device',
        sessionValues: {
          displayId: String(display.id),
        },
      })),
    };
  } catch (err) {
    debugLog('computer scan failed:', err);
    return { devices: [] };
  }
}
