import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { findLinuxBrowser, isHeadlessLinux } from './test-utils';

vi.setConfig({ testTimeout: 240 * 1000 });

// Dedicated user data dir so we can read Chrome's state
const userDataDir = '/tmp/midscene-chrome-ext-test';

/**
 * Read the extension ID from Chrome's Preferences file after launch.
 * Retries up to maxAttempts times waiting for Chrome to write the file.
 */
async function readExtensionId(
  maxAttempts = 15,
  intervalMs = 2000,
): Promise<string> {
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
            if (ext.manifest?.name === 'Midscene.js') {
              return id;
            }
          }
        }
      } catch {
        // JSON might be partially written, retry
      }
    }
    console.log(
      `Waiting for Chrome Preferences (attempt ${i + 1}/${maxAttempts})...`,
    );
    await sleep(intervalMs);
  }

  // Debug: list what exists in the profile dir
  const profileContents = fs.existsSync(userDataDir)
    ? execSync(`find ${userDataDir} -maxdepth 3 -type f | head -50`)
        .toString()
        .trim()
    : '(dir does not exist)';
  throw new Error(
    `Failed to read extension ID after ${maxAttempts} attempts. Profile contents:\n${profileContents}`,
  );
}

/**
 * Launch Chrome with extension and a known user-data-dir.
 * Uses spawn to keep Chrome running and capture stderr for debugging.
 */
async function launchChromeWithExtension(
  extensionPath: string,
  url: string,
): Promise<void> {
  if (!isHeadlessLinux()) {
    throw new Error('Only supports headless Linux CI');
  }
  // Clean previous profile
  execSync(`rm -rf ${userDataDir}`, { stdio: 'ignore' });

  const browser = findLinuxBrowser();
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
  console.log(`Launching: ${browser} ${args.join(' ')}`);

  const child = spawn(browser, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: process.env,
  });

  // Log stderr for debugging
  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Chrome stderr] ${msg}`);
  });

  child.on('exit', (code) => {
    console.log(`[Chrome] exited with code ${code}`);
  });

  child.unref();
  await sleep(10000);

  // Verify Chrome is still running
  try {
    process.kill(child.pid!, 0);
    console.log(`[Chrome] process ${child.pid} is running`);
  } catch {
    console.log('[Chrome] process is NOT running - it may have crashed');
  }
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

    // Read extension ID from Chrome profile (with retries)
    extensionId = await readExtensionId();
    console.log('Extension ID:', extensionId);
  });

  it('extension loads and UI is accessible', async () => {
    // Navigate directly to the extension page using its ID
    const extensionUrl = `chrome-extension://${extensionId}/index.html`;
    console.log('Navigating to:', extensionUrl);

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
