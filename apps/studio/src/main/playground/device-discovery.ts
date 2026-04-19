import { getDebug } from '@midscene/shared/logger';
import type { DiscoveredDevice } from '@shared/electron-contract';

const debugLog = getDebug('studio:device-discovery', { console: true });

/**
 * Scan all platforms for connected devices. Each platform's scan is
 * independent — a failure on one platform (e.g. `hdc` not installed)
 * does not prevent others from returning results.
 *
 * iOS is intentionally omitted: device discovery requires WebDriverAgent
 * to be running, which is a manual step. iOS devices show up after the
 * user creates a session via the setup form.
 */
export async function discoverAllDevices(): Promise<DiscoveredDevice[]> {
  const scans = await Promise.allSettled([
    scanAndroidDevices(),
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
    }));
  } catch (err) {
    debugLog('android scan failed:', err);
    return [];
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
    }));
  } catch (err) {
    debugLog('computer scan failed:', err);
    return [];
  }
}
