import { execSync } from 'node:child_process';
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
 */
function readExtensionId(): string {
  const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
  const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
  const extensions = prefs?.extensions?.settings;
  if (!extensions) {
    throw new Error('No extensions found in Chrome Preferences');
  }
  for (const [id, ext] of Object.entries(extensions) as [string, any][]) {
    if (ext.manifest?.name === 'Midscene.js') {
      return id;
    }
  }
  throw new Error(
    `Midscene.js extension not found. Available: ${Object.keys(extensions).join(', ')}`,
  );
}

/**
 * Launch Chrome with extension and a known user-data-dir.
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
  const flags = [
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
  ].join(' ');
  execSync(`${browser} ${flags} "${url}" &`, {
    stdio: 'ignore',
    shell: '/bin/bash',
  });
  await sleep(8000);
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

    // Read extension ID from Chrome profile
    extensionId = readExtensionId();
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
