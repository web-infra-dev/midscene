// @ts-ignore - libnut types might not be available
import * as libnut from '@computer-use/libnut';
import screenshot from 'screenshot-desktop';
import type { DisplayInfo } from './device';

export interface EnvironmentCheck {
  available: boolean;
  error?: string;
  platform: string;
  displays: number;
}

/**
 * Check if the computer environment is available
 */
export async function checkComputerEnvironment(): Promise<EnvironmentCheck> {
  try {
    // Check if libnut is available
    const screenSize = libnut.getScreenSize();
    if (!screenSize || screenSize.width <= 0) {
      return {
        available: false,
        error: 'libnut cannot get screen size',
        platform: process.platform,
        displays: 0,
      };
    }

    // Check if screenshot-desktop is available
    const displays = await screenshot.listDisplays();

    return {
      available: true,
      platform: process.platform,
      displays: displays.length,
    };
  } catch (error: any) {
    return {
      available: false,
      error: error.message,
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
    const displays = await screenshot.listDisplays();
    return displays.map((d: any) => ({
      id: String(d.id),
      name: d.name || `Display ${d.id}`,
      primary: d.primary || false,
    }));
  } catch (error) {
    console.error('Failed to get connected displays:', error);
    return [];
  }
}
