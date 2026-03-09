import { existsSync } from 'node:fs';
import { MIDSCENE_MCP_CHROME_PATH, globalConfigManager } from '../env';

export function getSystemChromePath(): string | undefined {
  const platform = process.platform;

  const chromePaths: Record<string, string[]> = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `C:\\Users\\${process.env.USERNAME ?? process.env.USER}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    linux: [
      // Prefer actual binaries over wrapper scripts.
      // Wrappers in /usr/bin may strip --user-data-dir, causing
      // "DevTools remote debugging requires a non-default data directory" errors.
      '/opt/google/chrome/chrome',
      '/opt/google/chrome/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ],
  };

  const paths = chromePaths[platform] ?? [];
  return paths.find((p) => existsSync(p));
}

export function resolveChromePath(): string {
  const envPath = globalConfigManager.getEnvConfigValue(
    MIDSCENE_MCP_CHROME_PATH,
  );
  if (envPath && envPath !== 'auto' && existsSync(envPath)) {
    return envPath;
  }
  const systemPath = getSystemChromePath();
  if (systemPath) return systemPath;

  throw new Error(
    'Chrome not found. Install Google Chrome or set MIDSCENE_MCP_CHROME_PATH environment variable.',
  );
}
