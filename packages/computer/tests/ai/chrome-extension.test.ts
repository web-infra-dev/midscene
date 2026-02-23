import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { isHeadlessLinux } from './test-utils';

vi.setConfig({ testTimeout: 240 * 1000 });

const userDataDir = '/tmp/midscene-chrome-ext-test';

/**
 * Find a Chrome/Chromium binary that supports --load-extension.
 * Chrome 137+ branded builds removed --load-extension support,
 * so we prefer Chrome for Testing (installed by Puppeteer) or Chromium.
 */
function findExtensionCapableBrowser(): string {
  // Puppeteer's Chrome for Testing
  const puppeteerBase = path.join(
    process.env.HOME || '~',
    '.cache/puppeteer/chrome',
  );
  if (fs.existsSync(puppeteerBase)) {
    const versions = fs
      .readdirSync(puppeteerBase)
      .filter((d) => d.startsWith('linux-'));
    if (versions.length > 0) {
      const chromeBin = path.join(
        puppeteerBase,
        versions[0],
        'chrome-linux64',
        'chrome',
      );
      if (fs.existsSync(chromeBin)) {
        console.log(`Using Chrome for Testing: ${chromeBin}`);
        return chromeBin;
      }
    }
  }

  // Chromium (supports --load-extension)
  for (const bin of ['chromium-browser', 'chromium']) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      console.log(`Using Chromium: ${bin}`);
      return bin;
    } catch {
      // try next
    }
  }

  throw new Error(
    'No extension-capable browser found. Need Chrome for Testing or Chromium.',
  );
}

/**
 * Read the extension ID from Chrome's Preferences file.
 */
async function readExtensionId(maxAttempts = 15): Promise<string> {
  const prefsPath = path.join(userDataDir, 'Default', 'Preferences');

  for (let i = 0; i < maxAttempts; i++) {
    if (fs.existsSync(prefsPath)) {
      try {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
        const extensions = prefs?.extensions?.settings;
        if (extensions) {
          for (const [id, ext] of Object.entries(extensions) as [
            string,
            any,
          ][]) {
            if (
              (ext as any).manifest?.name === 'Midscene.js' ||
              (ext as any).path?.includes('chrome-extension/dist')
            ) {
              return id;
            }
          }
        }
      } catch {
        // retry
      }
    }
    console.log(
      `Waiting for extension in Preferences (${i + 1}/${maxAttempts})...`,
    );
    await sleep(2000);
  }
  throw new Error(
    `Midscene.js extension not found after ${maxAttempts} attempts`,
  );
}

async function launchChromeWithExtension(
  extensionPath: string,
  url: string,
): Promise<void> {
  if (!isHeadlessLinux()) {
    throw new Error('Only supports headless Linux CI');
  }
  execSync(`rm -rf ${userDataDir}`, { stdio: 'ignore' });

  const browser = findExtensionCapableBrowser();
  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1920,1080',
    '--start-maximized',
    url,
  ];

  console.log(`DISPLAY=${process.env.DISPLAY}`);
  console.log(`Launching: ${browser} ${args.slice(0, 3).join(' ')} ...`);

  const child = spawn(browser, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: process.env,
  });

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('dbus')) console.log(`[Chrome stderr] ${msg}`);
  });

  child.unref();
  await sleep(10000);
}

describe('chrome extension basic test', () => {
  let agent: ComputerAgent;
  let extensionId: string;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext: 'Chrome browser with Midscene.js extension loaded.',
    });
    await launchChromeWithExtension(
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
    extensionId = await readExtensionId();
    console.log('Extension ID:', extensionId);
  });

  it('extension loads and UI is accessible', async () => {
    const extensionUrl = `chrome-extension://${extensionId}/index.html`;
    await agent.aiAct(
      `Click the browser address bar, type "${extensionUrl}" and press Enter`,
    );
    await sleep(5000);
    await agent.aiAssert('The page shows the Midscene.js extension UI');
  });

  it('extension page shows mode tabs', async () => {
    await agent.aiAssert(
      'The page contains tabs or buttons for Playground, Bridge, and Recorder modes',
    );
  });
});
