import { ComputerDevice, type DisplayInfo } from './device';

export interface EnvironmentCheck {
  available: boolean;
  error?: string;
  platform: string;
  displays: number;
}

export interface AccessibilityCheckResult {
  hasPermission: boolean;
  platform: string;
  error?: string;
}

/**
 * Check if macOS accessibility permission is granted
 * On other platforms, always returns true
 *
 * @param promptIfNeeded - If true, will trigger system prompt and open settings when permission is not granted (macOS only)
 */
export function checkAccessibilityPermission(
  promptIfNeeded = false,
): AccessibilityCheckResult {
  if (process.platform !== 'darwin') {
    return {
      hasPermission: true,
      platform: process.platform,
    };
  }

  try {
    // Use node-mac-permissions to check accessibility permission
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      getAuthStatus,
      askForAccessibilityAccess,
    } = require('node-mac-permissions');
    const status = getAuthStatus('accessibility');

    if (status === 'authorized') {
      return {
        hasPermission: true,
        platform: process.platform,
      };
    }

    // Trigger system prompt and open settings if requested
    if (promptIfNeeded) {
      askForAccessibilityAccess();
    }

    return {
      hasPermission: false,
      platform: process.platform,
      error:
        `macOS Accessibility permission is required (current status: ${status}).\n\n` +
        'Please follow these steps:\n' +
        '1. Open System Settings > Privacy & Security > Accessibility\n' +
        '2. Enable the application running this script (e.g., Terminal, iTerm2, VS Code, WebStorm)\n' +
        '3. Restart your terminal or IDE after granting permission\n\n' +
        'For more details, see: https://github.com/nut-tree/nut.js#macos',
    };
  } catch (error) {
    return {
      hasPermission: false,
      platform: process.platform,
      error: `Failed to check accessibility permission: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if the computer environment is available
 */
export async function checkComputerEnvironment(): Promise<EnvironmentCheck> {
  try {
    const libnutModule = await import(
      '@computer-use/libnut/dist/import_libnut.js'
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
