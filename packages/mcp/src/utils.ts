import { existsSync } from 'node:fs';
import { MIDSCENE_MCP_CHROME_PATH, getAIConfig } from '@midscene/shared/env';

// Deep merge utility function
export function deepMerge(target: any, source: any): any {
  const output = Object.assign({}, target);
  if (typeof target !== 'object' || typeof source !== 'object') return source;

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      // Deduplicate args/ignoreDefaultArgs, prefer source values
      output[key] = Array.from(
        new Set([
          ...(key === 'args' || key === 'ignoreDefaultArgs'
            ? targetVal.filter(
                (arg: string) =>
                  !sourceVal.some(
                    (launchArg: string) =>
                      arg.startsWith('--') &&
                      launchArg.startsWith(arg.split('=')[0]),
                  ),
              )
            : targetVal),
          ...sourceVal,
        ]),
      );
    } else if (sourceVal instanceof Object && key in target) {
      output[key] = deepMerge(targetVal, sourceVal);
    } else {
      output[key] = sourceVal;
    }
  }
  return output;
}

export function getSystemChromePath(): string | undefined {
  const platform = process.platform;
  const isDocker = process.env.DOCKER_CONTAINER === 'true';

  // Priority 1: Use Docker's MIDSCENE_MCP_CHROME_PATH environment variable
  if (
    isDocker &&
    process.env.MIDSCENE_MCP_CHROME_PATH &&
    existsSync(process.env.MIDSCENE_MCP_CHROME_PATH)
  ) {
    return process.env.MIDSCENE_MCP_CHROME_PATH;
  }

  const chromePaths = {
    darwin: isDocker
      ? [
          // Docker on macOS (rare but possible)
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ],
    win32: isDocker
      ? [
          // Docker Windows containers
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `C:\\Users\\${process.env.USERNAME || process.env.USER}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
        ],
    linux: isDocker
      ? [
          // Simplified Docker paths (fallback only)
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/snap/bin/chromium',
          '/opt/google/chrome/chrome',
          '/opt/google/chrome/google-chrome',
        ],
  };

  const paths = chromePaths[platform as keyof typeof chromePaths] || [];
  return paths.find((path) => existsSync(path));
}

export function getChromePathFromEnv(): string | undefined {
  const envChromePath = getAIConfig(MIDSCENE_MCP_CHROME_PATH);
  if (
    envChromePath !== 'auto' &&
    envChromePath !== undefined &&
    existsSync(envChromePath)
  ) {
    return envChromePath;
  }
  return getSystemChromePath();
}
