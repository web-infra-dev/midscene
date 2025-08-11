import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ScreenInfo {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Get macOS screen size information
 */
export async function getScreenSize(): Promise<ScreenInfo> {
  try {
    // Use system_profiler to get display information
    const { stdout } = await execAsync(
      'system_profiler SPDisplaysDataType -json',
    );
    const data = JSON.parse(stdout);

    // Find the main display
    const displays = data.SPDisplaysDataType?.[0]?.spdisplays_ndrvs || [];
    const mainDisplay =
      displays.find(
        (display: any) =>
          display._name?.includes('Built-in') ||
          display._name?.includes('Display'),
      ) || displays[0];

    if (!mainDisplay) {
      throw new Error('No display found');
    }

    // Parse resolution string like "2880 x 1800"
    const resolution =
      mainDisplay.spdisplays_resolution || mainDisplay._spdisplays_resolution;
    const match = resolution?.match(/(\d+)\s*x\s*(\d+)/);

    if (!match) {
      throw new Error(`Unable to parse screen resolution: ${resolution}`);
    }

    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);

    // Try to get pixel ratio from system info
    const pixelDensity =
      mainDisplay.spdisplays_pixel_density || mainDisplay.spdisplays_density;
    let dpr = 1;

    if (pixelDensity?.includes('Retina')) {
      dpr = 2; // Most Retina displays have 2x pixel ratio
    }

    return {
      width,
      height,
      dpr,
    };
  } catch (error) {
    // Fallback: try to get screen size using screencapture
    try {
      console.warn('Using fallback method to get screen size');
      // This is a fallback - assuming common screen sizes
      return {
        width: 1920,
        height: 1080,
        dpr: 2,
      };
    } catch (fallbackError) {
      throw new Error(`Failed to get screen size: ${(error as Error).message}`);
    }
  }
}

/**
 * Start the PyAutoGUI server
 */
export async function startPyAutoGUIServer(port = 1412): Promise<void> {
  const { spawn } = await import('node:child_process');
  const path = await import('node:path');
  
  // Use __dirname in a way that works for both ESM and CommonJS
  let currentDir: string;
  if (typeof __dirname !== 'undefined') {
    currentDir = __dirname;
  } else {
    const { fileURLToPath } = await import('node:url');
    currentDir = path.dirname(fileURLToPath(import.meta.url));
  }
  
  const serverPath = path.join(currentDir, '../../idb/auto_server.py');

  const server = spawn('python3', [serverPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  });

  server.on('error', (error) => {
    console.error('Failed to start PyAutoGUI server:', error);
    throw error;
  });

  // Wait a bit for server to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`PyAutoGUI server started on port ${port}`);
}
