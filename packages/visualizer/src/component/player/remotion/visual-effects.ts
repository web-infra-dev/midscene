/**
 * Device shell layout configuration.
 * Used by Remotion preview and Canvas export for portrait-in-landscape rendering.
 */

// ── Device shell types ──────────────────────────────────────

export type DeviceShellType =
  | 'none'
  | 'desktop-browser'
  | 'iphone'
  | 'android'
  | 'desktop-app';

export function resolveShellType(deviceType?: string): DeviceShellType {
  switch (deviceType) {
    case 'android':
    case 'harmony':
      return 'android';
    case 'ios':
    case 'iphone':
      return 'iphone';
    case 'computer':
    case 'desktop-app':
      return 'desktop-app';
    case 'desktop-browser':
      return 'desktop-browser';
    default:
      return 'none';
  }
}

export interface DeviceLayout {
  margin: number;
  borderRadius: number;
  bezelWidth: number;
  bezelBackground: string;
}

// ── Device layout constants ──

export const CHROME_BORDER_RADIUS = 10;
export const IPHONE_BORDER_RADIUS = 40;
export const ANDROID_BORDER_RADIUS = 44;

export function getDeviceLayout(shellType: DeviceShellType): DeviceLayout {
  const isMobile = shellType === 'iphone' || shellType === 'android';
  const bezelBackground = isMobile
    ? 'linear-gradient(145deg, #555 0%, #333 40%, #444 100%)'
    : 'linear-gradient(145deg, #444 0%, #2a2a2a 40%, #333 100%)';

  switch (shellType) {
    case 'iphone':
      return {
        margin: 20,
        borderRadius: IPHONE_BORDER_RADIUS,
        bezelWidth: 28,
        bezelBackground,
      };
    case 'android':
      return {
        margin: 32,
        borderRadius: ANDROID_BORDER_RADIUS,
        bezelWidth: 28,
        bezelBackground,
      };
    case 'desktop-app':
      return {
        margin: 24,
        borderRadius: 10,
        bezelWidth: 16,
        bezelBackground,
      };
    case 'desktop-browser':
      return {
        margin: 24,
        borderRadius: CHROME_BORDER_RADIUS,
        bezelWidth: 16,
        bezelBackground,
      };
    default:
      return {
        margin: 0,
        borderRadius: 0,
        bezelWidth: 0,
        bezelBackground: 'transparent',
      };
  }
}
