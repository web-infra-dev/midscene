import type { DiscoveredDevice } from '@shared/electron-contract';

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
  const results: DiscoveredDevice[] = [];

  // Run each platform scan concurrently; never let one crash the whole scan.
  const scans = await Promise.allSettled([
    scanAndroidDevices(),
    scanHarmonyDevices(),
    scanComputerDisplays(),
  ]);

  for (const scan of scans) {
    if (scan.status === 'fulfilled') {
      results.push(...scan.value);
    }
  }

  return results;
}

async function scanAndroidDevices(): Promise<DiscoveredDevice[]> {
  try {
    // Dynamic import with `as string` to bypass TS module resolution —
    // @midscene/android is externalized and resolved at runtime by Node.
    const mod = await (import('@midscene/android' as string) as Promise<
      typeof import('@midscene/android')
    >);
    const devices = await mod.getConnectedDevicesWithDetails();
    return devices.map((device) => ({
      platformId: 'android' as const,
      id: device.udid,
      label: (device as { label?: string }).label || device.udid,
      description: `ADB: ${device.udid}`,
    }));
  } catch {
    return [];
  }
}

async function scanHarmonyDevices(): Promise<DiscoveredDevice[]> {
  try {
    const mod = await import('@midscene/harmony');
    const devices = await mod.getConnectedDevices();
    return devices.map((device) => ({
      platformId: 'harmony' as const,
      id: device.deviceId,
      label: device.deviceId,
      description: `HDC: ${device.deviceId}`,
    }));
  } catch {
    return [];
  }
}

async function scanComputerDisplays(): Promise<DiscoveredDevice[]> {
  try {
    const mod = await import('@midscene/computer');
    const displays = await mod.getConnectedDisplays();
    return displays.map(
      (display: {
        id: string | number;
        label?: string;
        width?: number;
        height?: number;
      }) => ({
        platformId: 'computer' as const,
        id: String(display.id),
        label: display.label || `Display ${display.id}`,
        description: display.width
          ? `${display.width}x${display.height}`
          : undefined,
      }),
    );
  } catch {
    return [];
  }
}
