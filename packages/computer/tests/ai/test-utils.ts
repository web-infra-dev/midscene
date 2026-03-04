import { execSync, spawn } from 'node:child_process';
import { sleep } from '@midscene/core/utils';
import type { ComputerAgent } from '../../src';

const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/**
 * Check if running in a headless Linux environment (Xvfb, no desktop)
 */
export function isHeadlessLinux(): boolean {
  return IS_LINUX && !!process.env.CI;
}

/**
 * Find an available browser binary on Linux
 */
export function findLinuxBrowser(): string {
  const candidates = [
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium',
  ];
  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error(`No browser found. Tried: ${candidates.join(', ')}`);
}

/**
 * Opens a browser and navigates to the specified URL
 */
export async function openBrowserAndNavigate(
  agent: ComputerAgent,
  url: string,
): Promise<void> {
  if (isHeadlessLinux()) {
    // In headless Linux CI, launch browser directly via command line
    const browser = findLinuxBrowser();
    const child = spawn(
      browser,
      [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--window-size=1920,1080',
        '--start-maximized',
        url,
      ],
      { stdio: 'ignore', detached: true },
    );
    child.unref();
    await sleep(8000);
    return;
  }

  if (IS_MAC) {
    await agent.aiAct('press Cmd+Space');
    await sleep(500);
    await agent.aiAct('type "Safari" and press Enter');
    await sleep(2000);
    await agent.aiAct('press Cmd+L to focus address bar');
  } else {
    await agent.aiAct('press Windows key');
    await sleep(500);
    await agent.aiAct('type "Chrome" and press Enter');
    await sleep(2000);
    await agent.aiAct('press Ctrl+L to focus address bar');
  }
  await sleep(300);

  await agent.aiAct(`type "${url}"`);
  await agent.aiAct('press Enter');
  await sleep(3000);
}
