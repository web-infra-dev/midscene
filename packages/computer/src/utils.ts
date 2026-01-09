import { ComputerDevice, type DisplayInfo } from './device';

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
    const libnutModule = await import(
      '@computer-use/libnut/dist/import_libnut'
    );
    const libnut = libnutModule.libnut;
    const screenSize = libnut.getScreenSize();
    if (!screenSize || screenSize.width <= 0) {
      return {
        available: false,
        error: 'libnut cannot get screen size',
        platform: process.platform,
        displays: 0,
      };
    }

    const displays = await ComputerDevice.listDisplays();
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
  return ComputerDevice.listDisplays();
}
