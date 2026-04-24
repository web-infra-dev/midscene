import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import type {
  DiscoverDevicesResult,
  DiscoveredDevice,
} from '@shared/electron-contract';
import { ensureStudioShellEnvHydrated } from '../shell-env';

const debugLog = getDebug('studio:device-discovery', { console: true });
const IOS_WDA_DISCOVERY_HOST = 'localhost';
const IOS_WDA_DISCOVERY_TIMEOUT_MS = 1000;
export const DEVICE_DISCOVERY_POLL_INTERVAL_MS = 5000;

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
  let currentSnapshot: DiscoverDevicesResult = [];
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
export async function discoverAllDevices(): Promise<DiscoveredDevice[]> {
  const scans = await Promise.allSettled([
    scanAndroidDevices(),
    scanIOSDevices(),
    scanHarmonyDevices(),
    scanComputerDisplays(),
  ]);

  const results: DiscoveredDevice[] = [];
  for (const scan of scans) {
    if (scan.status === 'fulfilled') {
      results.push(...scan.value);
    } else {
      debugLog('platform scan rejected:', scan.reason);
    }
  }

  return results;
}

async function scanAndroidDevices(): Promise<DiscoveredDevice[]> {
  try {
    ensureStudioShellEnvHydrated();
    const { getConnectedDevicesWithDetails } = await import(
      '@midscene/android'
    );
    const devices = await getConnectedDevicesWithDetails();
    return devices.map((device) => ({
      platformId: 'android',
      id: device.udid,
      label: (device as { label?: string }).label || device.udid,
      description: `ADB: ${device.udid}`,
      status: device.state,
      sessionValues: {
        deviceId: device.udid,
      },
    }));
  } catch (err) {
    debugLog('android scan failed:', err);
    return [];
  }
}

async function scanIOSDevices(): Promise<DiscoveredDevice[]> {
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
      return [];
    }

    const status = (await response.json()) as WDAStatusResponse;
    if (status.value?.ready !== true) {
      return [];
    }

    return [
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
    ];
  } catch (err) {
    debugLog('ios scan failed:', err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scanHarmonyDevices(): Promise<DiscoveredDevice[]> {
  try {
    ensureStudioShellEnvHydrated();
    const { getConnectedDevices } = await import('@midscene/harmony');
    const devices = await getConnectedDevices();
    return devices.map((device) => ({
      platformId: 'harmony',
      id: device.deviceId,
      label: device.deviceId,
      description: `HDC: ${device.deviceId}`,
      status: 'device',
      sessionValues: {
        deviceId: device.deviceId,
      },
    }));
  } catch (err) {
    debugLog('harmony scan failed:', err);
    return [];
  }
}

async function scanComputerDisplays(): Promise<DiscoveredDevice[]> {
  try {
    const { getConnectedDisplays } = await import('@midscene/computer');
    const displays = await getConnectedDisplays();
    return displays.map((display) => ({
      platformId: 'computer',
      id: String(display.id),
      label: display.name || `Display ${display.id}`,
      description: display.primary ? 'Primary display' : undefined,
      status: 'device',
      sessionValues: {
        displayId: String(display.id),
      },
    }));
  } catch (err) {
    debugLog('computer scan failed:', err);
    return [];
  }
}
