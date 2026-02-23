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
  const securePrefsPath = path.join(
    userDataDir,
    'Default',
    'Secure Preferences',
  );

  for (let i = 0; i < maxAttempts; i++) {
    // Try both Preferences and Secure Preferences
    for (const filePath of [prefsPath, securePrefsPath]) {
      if (fs.existsSync(filePath)) {
        try {
          const prefs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const extensions = prefs?.extensions?.settings;
          if (extensions) {
            // Log all found extensions for debugging
            if (i === 0) {
              for (const [id, ext] of Object.entries(extensions) as [
                string,
                any,
              ][]) {
                const name =
                  (ext as any).manifest?.name || (ext as any).path || 'unknown';
                console.log(
                  `[${path.basename(filePath)}] Extension: ${id} -> ${name}`,
                );
              }
            }
            for (const [id, ext] of Object.entries(extensions) as [
              string,
              any,
            ][]) {
              const name = (ext as any).manifest?.name;
              const extPath = (ext as any).path;
              if (
                name === 'Midscene.js' ||
                extPath?.includes('chrome-extension/dist')
              ) {
                return id;
              }
            }
          }
        } catch {
          // JSON might be partially written, retry
        }
      }
    }
    console.log(
      `Waiting for extension in Preferences (attempt ${i + 1}/${maxAttempts})...`,
    );
    await sleep(intervalMs);
  }

  // Debug: dump both prefs files
  for (const filePath of [prefsPath, securePrefsPath]) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        const prefs = JSON.parse(content);
        const extensions = prefs?.extensions?.settings || {};
        console.log(
          `[${path.basename(filePath)}] All extension IDs: ${Object.keys(extensions).join(', ')}`,
        );
        for (const [id, ext] of Object.entries(extensions) as [string, any][]) {
          console.log(
            `  ${id}: name=${(ext as any).manifest?.name}, path=${(ext as any).path}`,
          );
        }
      } catch {
        console.log(
          `[${path.basename(filePath)}] Parse error, first 2000 chars: ${content.substring(0, 2000)}`,
        );
      }
    }
  }
  throw new Error(
    `Midscene.js extension not found after ${maxAttempts} attempts`,
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
  // Pre-create Preferences with extensions enabled to help --load-extension work
  const defaultDir = path.join(userDataDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, 'Preferences'),
    JSON.stringify({
      extensions: { ui: { developer_mode: true } },
    }),
  );

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
