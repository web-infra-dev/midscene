import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import type { DiscoveredDevice } from '@shared/electron-contract';

const debugLog = getDebug('studio:device-discovery', { console: true });
const IOS_WDA_DISCOVERY_HOST = 'localhost';
const IOS_WDA_DISCOVERY_TIMEOUT_MS = 1000;

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
    const { getConnectedDevicesWithDetails } = await import(
      '@midscene/android'
    );
    const devices = await getConnectedDevicesWithDetails();
    return devices.map((device) => ({
      platformId: 'android',
      id: device.udid,
      label: (device as { label?: string }).label || device.udid,
      description: `ADB: ${device.udid}`,
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
    const { getConnectedDevices } = await import('@midscene/harmony');
    const devices = await getConnectedDevices();
    return devices.map((device) => ({
      platformId: 'harmony',
      id: device.deviceId,
      label: device.deviceId,
      description: `HDC: ${device.deviceId}`,
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
      sessionValues: {
        displayId: String(display.id),
      },
    }));
  } catch (err) {
    debugLog('computer scan failed:', err);
    return [];
  }
}
