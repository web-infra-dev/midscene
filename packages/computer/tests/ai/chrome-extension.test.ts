import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { isHeadlessLinux } from './test-utils';

vi.setConfig({ testTimeout: 240 * 1000 });

const userDataDir = '/tmp/midscene-chrome-ext-test';
const CDP_PORT = 9222;

/**
 * Find a Chrome/Chromium binary that supports --load-extension.
 * Chrome 137+ branded builds removed --load-extension support,
 * so we prefer Chrome for Testing (installed by Puppeteer) or Chromium.
 */
function findExtensionCapableBrowser(): string {
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
        return chromeBin;
      }
    }
  }

  for (const bin of ['chromium-browser', 'chromium']) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
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

/**
 * Build the env config string from process.env.
 * Only includes MIDSCENE_* and OPENAI_* vars that are set.
 */
function buildExtensionEnvConfig(): string {
  const envKeys = [
    'MIDSCENE_OPENAI_INIT_CONFIG_JSON',
    'MIDSCENE_MODEL_INIT_CONFIG_JSON',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_API_KEY',
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_FAMILY',
    'MIDSCENE_USE_QWEN3_VL',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
  ];

  const lines: string[] = [];
  for (const key of envKeys) {
    const value = process.env[key];
    if (value) {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join('\n');
}

/**
 * Find a CDP page target matching the extension ID.
 * Only 'page' type targets have localStorage — service_worker does not.
 */
async function findExtensionPageTarget(
  extensionId: string,
): Promise<any | null> {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const targets = await res.json();
  console.log(
    'CDP targets:',
    targets.map((t: any) => `${t.type}: ${t.url?.substring(0, 80)}`),
  );
  const extPrefix = `chrome-extension://${extensionId}`;
  return (
    targets.find(
      (t: any) => t.url?.startsWith(extPrefix) && t.type === 'page',
    ) || null
  );
}

/**
 * Inject env config into Chrome extension's localStorage via CDP.
 * The extension stores config at key 'midscene-env-config' in localStorage.
 */
async function injectExtensionConfig(extensionId: string): Promise<void> {
  const configString = buildExtensionEnvConfig();
  if (!configString) {
    console.log('No env config to inject, skipping');
    return;
  }
  console.log(
    'Injecting env config keys:',
    configString
      .split('\n')
      .map((l) => l.split('=')[0])
      .join(', '),
  );

  let target = await findExtensionPageTarget(extensionId);

  if (!target) {
    // No extension page exists yet — open one so we can inject localStorage
    console.log('No extension page target found, opening extension page...');
    const extUrl = `chrome-extension://${extensionId}/index.html`;
    const newTabRes = await fetch(
      `http://127.0.0.1:${CDP_PORT}/json/new?${extUrl}`,
    );
    const newTab = await newTabRes.json();

    // Wait for the target to appear
    for (let i = 0; i < 5; i++) {
      await sleep(2000);
      target = await findExtensionPageTarget(extensionId);
      if (target) break;
      console.log(`Waiting for extension page target (${i + 1}/5)...`);
    }

    if (!target) {
      // Last resort: navigate existing tab to extension URL, inject, then navigate back
      console.log('Falling back: navigating existing tab to extension URL...');
      const res2 = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      const allTargets = await res2.json();
      const anyPage = allTargets.find(
        (t: any) => t.type === 'page' && t.webSocketDebuggerUrl,
      );
      if (!anyPage) {
        throw new Error('No CDP page targets available for config injection');
      }
      const originalUrl = anyPage.url;
      await navigateAndInject(
        anyPage.webSocketDebuggerUrl,
        extUrl,
        configString,
        originalUrl,
      );
      return;
    }

    await injectViaWebSocket(target.webSocketDebuggerUrl, configString);

    // Close the extension tab we opened and switch back to the original page
    if (newTab?.id) {
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${newTab.id}`);
      await sleep(1000);
    }
    return;
  }

  await injectViaWebSocket(target.webSocketDebuggerUrl, configString);
}

async function navigateAndInject(
  wsUrl: string,
  extUrl: string,
  configString: string,
  originalUrl: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let step = 0;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Page.navigate',
          params: { url: extUrl },
        }),
      );
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(
        typeof event.data === 'string' ? event.data : String(event.data),
      );
      if (msg.id === 1 && step === 0) {
        step = 1;
        setTimeout(() => {
          const escaped = JSON.stringify(configString);
          ws.send(
            JSON.stringify({
              id: 2,
              method: 'Runtime.evaluate',
              params: {
                expression: `localStorage.setItem('midscene-env-config', ${escaped})`,
              },
            }),
          );
        }, 2000);
      }
      if (msg.id === 2 && step === 1) {
        step = 2;
        console.log('Config injected via navigate fallback');
        ws.send(
          JSON.stringify({
            id: 3,
            method: 'Page.navigate',
            params: { url: originalUrl },
          }),
        );
      }
      if (msg.id === 3 && step === 2) {
        ws.close();
        resolve();
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => {
      ws.close();
      reject(new Error('Navigate-and-inject timed out'));
    }, 15000);
  });
}

async function injectViaWebSocket(
  wsUrl: string,
  configString: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const escaped = JSON.stringify(configString);
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `localStorage.setItem('midscene-env-config', ${escaped})`,
          },
        }),
      );
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(
        typeof event.data === 'string' ? event.data : String(event.data),
      );
      if (msg.id === 1) {
        console.log('Config injected successfully via CDP');
        ws.close();
        resolve();
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => {
      ws.close();
      reject(new Error('CDP injection timed out'));
    }, 10000);
  });
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
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1920,1080',
    '--start-maximized',
    url,
  ];

  console.log(`DISPLAY=${process.env.DISPLAY}`);
  console.log('Launching browser...');

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
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded. The target page is a TodoMVC app. The extension icon may be in the Extensions (puzzle piece) menu in the toolbar.',
    });
    await launchChromeWithExtension(
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
    const extId = await readExtensionId();
    console.log('Extension ID:', extId);

    // Inject env config into extension's localStorage via CDP
    await injectExtensionConfig(extId);
  });

  it('open side panel via extension icon', async () => {
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);

    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);

    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI, and the TodoMVC page is still visible on the left',
    );
  });

  it('playground shows action tabs', async () => {
    await agent.aiAssert(
      'The side panel shows action tabs or buttons such as Act, Tap, Query, or Assert',
    );
  });

  it('run a task in playground', async () => {
    // Click the textarea in the side panel (placeholder: "What do you want to do?")
    await agent.aiAct(
      'Click the text area with placeholder "What do you want to do?" in the right side panel',
    );
    await sleep(500);

    // Type the instruction for the extension's AI to execute on the TodoMVC page
    await agent.aiAct(
      'Type the following text into the focused text area: Enter "Learn JS today" in the task box, then press Enter to create',
    );
    await sleep(500);

    // Click the Run button (blue button with send icon at bottom-right of the input area)
    await agent.aiAct(
      'Click the blue "Run" button with the send icon in the right side panel',
    );

    // Wait for the extension's AI to execute the action on the page
    await sleep(30000);

    await agent.aiAssert(
      'The TodoMVC page on the left shows a todo item containing "Learn JS today"',
    );
  });
});
