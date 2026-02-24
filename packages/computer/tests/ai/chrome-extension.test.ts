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

// ─── Browser & Extension Helpers ────────────────────────────────────────────

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

// ─── CDP Helpers ────────────────────────────────────────────────────────────

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

  const target = await findExtensionPageTarget(extensionId);

  if (!target) {
    console.log(
      'No extension page target, navigating existing tab to inject...',
    );
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
      `chrome-extension://${extensionId}/index.html`,
      configString,
      originalUrl,
    );
    return;
  }

  await injectViaWebSocket(target.webSocketDebuggerUrl, configString);
}

function cdpSend(ws: WebSocket, id: number, method: string, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
}

function cdpParse(event: MessageEvent): any {
  return JSON.parse(
    typeof event.data === 'string' ? event.data : String(event.data),
  );
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
    ws.onopen = () => cdpSend(ws, 1, 'Page.navigate', { url: extUrl });
    ws.onmessage = (event) => {
      const msg = cdpParse(event);
      if (msg.id === 1 && step === 0) {
        step = 1;
        setTimeout(() => {
          const escaped = JSON.stringify(configString);
          cdpSend(ws, 2, 'Runtime.evaluate', {
            expression: `localStorage.setItem('midscene-env-config', ${escaped})`,
          });
        }, 2000);
      }
      if (msg.id === 2 && step === 1) {
        step = 2;
        console.log('Config injected via navigate fallback');
        cdpSend(ws, 3, 'Page.navigate', { url: originalUrl });
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
      cdpSend(ws, 1, 'Runtime.evaluate', {
        expression: `localStorage.setItem('midscene-env-config', ${escaped})`,
      });
    };
    ws.onmessage = (event) => {
      const msg = cdpParse(event);
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

async function reloadViaWebSocket(wsUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => cdpSend(ws, 1, 'Page.reload');
    ws.onmessage = (event) => {
      const msg = cdpParse(event);
      if (msg.id === 1) {
        console.log('Side panel reloaded to apply config');
        ws.close();
        resolve();
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => {
      ws.close();
      resolve();
    }, 5000);
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';

describe('chrome extension smoke test', () => {
  let agent: ComputerAgent;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded. The target page is a TodoMVC app. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
    const extId = await readExtensionId();
    console.log('Extension ID:', extId);
    (globalThis as any).__extId = extId;
  });

  // ── 1. Side Panel Launch ──────────────────────────────────────────────

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

    // Inject env config into the side panel's localStorage via CDP
    const extId = (globalThis as any).__extId;
    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  // ── 2. Playground UI Elements ───────────────────────────────────────

  it('playground: UI elements are rendered correctly', async () => {
    // Verify action type buttons
    await agent.aiAssert(
      `${SIDE_PANEL} shows action type buttons including "aiAct", "aiTap", "aiQuery", and "aiAssert"`,
    );
    // Verify input area and Run button
    await agent.aiAssert(
      `${SIDE_PANEL} has a text input area (textarea) and a blue "Run" button`,
    );
    // Verify settings gear icon
    await agent.aiAssert(
      `${SIDE_PANEL} has a gear or settings icon in the top-right area`,
    );
  });

  // ── 3. Action Type Switching ──────────────────────────────────────────

  it('playground: action type switching changes placeholder', async () => {
    await agent.aiAct(`Click the "aiQuery" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an input area with placeholder text containing "query"`,
    );

    await agent.aiAct(`Click the "aiAssert" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an input area with placeholder text containing "assert"`,
    );

    // Switch back to aiAct for the next test
    await agent.aiAct(`Click the "aiAct" button in ${SIDE_PANEL}`);
    await sleep(500);
  });

  // ── 4. Run aiAct Task ─────────────────────────────────────────────────

  it('playground: run aiAct to add a todo item', async () => {
    await agent.aiAct(
      `Click the text area in ${SIDE_PANEL} and type: Enter "Learn JS today" in the task box, then press Enter to create`,
    );
    await sleep(500);

    await agent.aiAct(`Click the blue "Run" button in ${SIDE_PANEL}`);
    await sleep(30000);

    await agent.aiAssert(
      'The TodoMVC page on the left shows a todo item containing "Learn JS today"',
    );

    // Also verify execution result is shown in the side panel
    await agent.aiAssert(
      `${SIDE_PANEL} shows execution result or progress messages below the input area`,
    );
  });

  // ── 5. Mode Switching (Recorder → Bridge → Playground) ────────────────

  it('mode switching: cycle through all modes', async () => {
    // Switch to Recorder
    await agent.aiAct(
      `Click the menu icon (hamburger or three-line icon) at the top-left of ${SIDE_PANEL}`,
    );
    await sleep(1000);
    await agent.aiAct(
      'Click "Recorder" or "Recorder (Preview)" in the dropdown menu',
    );
    await sleep(2000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows the Recorder mode UI, which may include a "New Recording" button or recording session list`,
    );

    // Switch to Bridge
    await agent.aiAct(
      `Click the menu icon (hamburger or three-line icon) at the top-left of ${SIDE_PANEL}`,
    );
    await sleep(1000);
    await agent.aiAct('Click "Bridge Mode" or "Bridge" in the dropdown menu');
    await sleep(2000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows the Bridge mode UI with connection status text such as "Listening" or "Disconnected"`,
    );

    // Switch back to Playground
    await agent.aiAct(
      `Click the menu icon (hamburger or three-line icon) at the top-left of ${SIDE_PANEL}`,
    );
    await sleep(1000);
    await agent.aiAct('Click "Playground" in the dropdown menu');
    await sleep(2000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows the Playground mode with action type buttons like "aiAct"`,
    );
  });

  // ── 6. Settings Modal ─────────────────────────────────────────────────

  it('settings: open and close env config modal', async () => {
    await agent.aiAct(
      `Click the gear or settings icon in the top area of ${SIDE_PANEL}`,
    );
    await sleep(1000);

    await agent.aiAssert(
      'A modal or dialog is visible with title containing "Config" or "Env" and a text area for environment variable configuration',
    );

    await agent.aiAct(
      'Click the "Cancel" button or the close button (X) on the modal',
    );
    await sleep(1000);

    await agent.aiAssert(
      `The modal is closed and ${SIDE_PANEL} is visible with Playground UI`,
    );
  });
});
