import screenshot from 'screenshot-desktop';
import type { DisplayInfo } from './device';

interface ScreenshotDisplay {
  id: string | number;
  name?: string;
  primary?: boolean;
}

export interface EnvironmentCheck {
  available: boolean;
  error?: string;
  platform: string;
  displays: number;
}

/**
 * Lazy load libnut to avoid loading native module at import time
 */
async function loadLibnut() {
  const libnutModule = await import('@computer-use/libnut/dist/import_libnut');
  return libnutModule.libnut;
}

/**
 * Check if the computer environment is available
 */
export async function checkComputerEnvironment(): Promise<EnvironmentCheck> {
  try {
    const libnut = await loadLibnut();
    const screenSize = libnut.getScreenSize();
    if (!screenSize || screenSize.width <= 0) {
      return {
        available: false,
        error: 'libnut cannot get screen size',
        platform: process.platform,
        displays: 0,
      };
    }

    const displays: ScreenshotDisplay[] = await screenshot.listDisplays();

    return {
      available: true,
      platform: process.platform,
      displays: displays.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      error: errorMessage,
      platform: process.platform,
      displays: 0,
    };
  }
}

/**
 * Get all connected displays
 */
export async function getConnectedDisplays(): Promise<DisplayInfo[]> {
  try {
    const displays: ScreenshotDisplay[] = await screenshot.listDisplays();
    return displays.map((d) => ({
      id: String(d.id),
      name: d.name || `Display ${d.id}`,
      primary: d.primary || false,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to get connected displays:', errorMessage);
    return [];
  }
}
