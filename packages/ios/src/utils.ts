import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const debugUtils = getDebug('ios:utils');

export function checkMacOSPlatform(): { isMacOS: boolean; platform: string } {
  const currentPlatform = platform();
  return {
    isMacOS: currentPlatform === 'darwin',
    platform: currentPlatform,
  };
}

export async function checkIOSEnvironment(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    // Check if running on macOS
    const platformCheck = checkMacOSPlatform();
    if (!platformCheck.isMacOS) {
      return {
        available: false,
        error: `iOS development is only supported on macOS. Current platform: ${platformCheck.platform}`,
      };
    }

    // Check if xcrun is available
    const { stdout: xcrunPath } = await execAsync('which xcrun');
    if (!xcrunPath.trim()) {
      return {
        available: false,
        error:
          'xcrun not found. Please install Xcode Command Line Tools: xcode-select --install',
      };
    }

    // Check if xcodebuild is available (required for WebDriverAgent)
    try {
      await execAsync('xcodebuild -version');
    } catch (error) {
      return {
        available: false,
        error: 'xcodebuild not found. Please install Xcode from the App Store',
      };
    }

    debugUtils('iOS environment is available for WebDriverAgent');
    return { available: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugUtils(`iOS environment not available: ${errorMsg}`);

    if (errorMsg.includes('xcrun')) {
      return {
        available: false,
        error:
          'Xcode Command Line Tools not properly configured. Please run: sudo xcode-select --reset',
      };
    } else {
      return {
        available: false,
        error: `iOS development environment not available: ${errorMsg}`,
      };
    }
  }
}
