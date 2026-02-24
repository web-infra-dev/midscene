import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { isHeadlessLinux } from './test-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

export const CDP_PORT = 9222;
const USER_DATA_DIR = '/tmp/midscene-chrome-ext-test';
const BROWSER_STARTUP_DELAY = 10_000;
const EXTENSION_POLL_INTERVAL = 2_000;
const CDP_INJECTION_TIMEOUT = 10_000;
const NAVIGATE_INJECT_TIMEOUT = 15_000;
const RELOAD_TIMEOUT = 5_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CdpTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface ExtensionSettings {
  manifest?: { name?: string };
  path?: string;
}

// ─── Environment Config Keys ────────────────────────────────────────────────

const EXTENSION_ENV_KEYS = [
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON',
  'MIDSCENE_MODEL_INIT_CONFIG_JSON',
  'MIDSCENE_MODEL_NAME',
  'MIDSCENE_MODEL_API_KEY',
  'MIDSCENE_MODEL_BASE_URL',
  'MIDSCENE_MODEL_FAMILY',
  'MIDSCENE_USE_QWEN3_VL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const;

// ─── Browser Helpers ────────────────────────────────────────────────────────

function findExtensionCapableBrowser(): string {
  // Check puppeteer cache first (Chrome for Testing supports --load-extension)
  const puppeteerBase = path.join(
    process.env.HOME ?? '~',
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

export async function launchChromeWithExtension(
  extensionPath: string,
  url: string,
): Promise<void> {
  if (!isHeadlessLinux()) {
    throw new Error('Only supports headless Linux CI');
  }
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });

  const browser = findExtensionCapableBrowser();
  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1920,1080',
    '--start-maximized',
    url,
  ];

  console.log('DISPLAY is set:', !!process.env.DISPLAY);
  console.log('Launching browser...');

  const child = spawn(browser, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: process.env,
  });

  child.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line && !line.includes('dbus')) console.log(`[Chrome stderr] ${line}`);
  });

  child.unref();
  await sleep(BROWSER_STARTUP_DELAY);
}

// ─── Extension ID Reader ────────────────────────────────────────────────────

export async function readExtensionId(maxAttempts = 15): Promise<string> {
  const prefsPath = path.join(USER_DATA_DIR, 'Default', 'Preferences');

  for (let i = 0; i < maxAttempts; i++) {
    if (fs.existsSync(prefsPath)) {
      try {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
        const extensions: Record<string, ExtensionSettings> | undefined =
          prefs?.extensions?.settings;
        if (extensions) {
          for (const [id, ext] of Object.entries(extensions)) {
            if (
              ext.manifest?.name === 'Midscene.js' ||
              ext.path?.includes('chrome-extension/dist')
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
    await sleep(EXTENSION_POLL_INTERVAL);
  }
  throw new Error(
    `Midscene.js extension not found after ${maxAttempts} attempts`,
  );
}

// ─── CDP Helpers ────────────────────────────────────────────────────────────

function cdpSend(ws: WebSocket, id: number, method: string, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
}

function cdpParse(event: MessageEvent): {
  id?: number;
  [key: string]: unknown;
} {
  return JSON.parse(
    typeof event.data === 'string' ? event.data : String(event.data),
  );
}

export async function findExtensionPageTarget(
  extensionId: string,
): Promise<CdpTarget | null> {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const targets: CdpTarget[] = await res.json();
  console.log(
    'CDP targets:',
    targets.map((t) => `${t.type}: ${t.url?.substring(0, 80)}`),
  );
  const extPrefix = `chrome-extension://${extensionId}`;
  return (
    targets.find((t) => t.url?.startsWith(extPrefix) && t.type === 'page') ??
    null
  );
}

// ─── Config Injection ───────────────────────────────────────────────────────

function buildExtensionEnvConfig(): string {
  const lines: string[] = [];
  for (const key of EXTENSION_ENV_KEYS) {
    const value = process.env[key];
    if (value) {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join('\n');
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
    }, CDP_INJECTION_TIMEOUT);
  });
}

type NavigateInjectStep = 'navigating' | 'injecting' | 'restoring';

async function navigateAndInject(
  wsUrl: string,
  extUrl: string,
  configString: string,
  originalUrl: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let step: NavigateInjectStep = 'navigating';
    ws.onopen = () => cdpSend(ws, 1, 'Page.navigate', { url: extUrl });
    ws.onmessage = (event) => {
      const msg = cdpParse(event);
      if (msg.id === 1 && step === 'navigating') {
        step = 'injecting';
        setTimeout(() => {
          const escaped = JSON.stringify(configString);
          cdpSend(ws, 2, 'Runtime.evaluate', {
            expression: `localStorage.setItem('midscene-env-config', ${escaped})`,
          });
        }, EXTENSION_POLL_INTERVAL);
      }
      if (msg.id === 2 && step === 'injecting') {
        step = 'restoring';
        console.log('Config injected via navigate fallback');
        cdpSend(ws, 3, 'Page.navigate', { url: originalUrl });
      }
      if (msg.id === 3 && step === 'restoring') {
        ws.close();
        resolve();
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => {
      ws.close();
      reject(new Error('Navigate-and-inject timed out'));
    }, NAVIGATE_INJECT_TIMEOUT);
  });
}

export async function injectExtensionConfig(
  extensionId: string,
): Promise<void> {
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
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    const allTargets: CdpTarget[] = await res.json();
    const anyPage = allTargets.find(
      (t) => t.type === 'page' && t.webSocketDebuggerUrl,
    );
    if (!anyPage) {
      throw new Error('No CDP page targets available for config injection');
    }
    await navigateAndInject(
      anyPage.webSocketDebuggerUrl!,
      `chrome-extension://${extensionId}/index.html`,
      configString,
      anyPage.url,
    );
    return;
  }

  await injectViaWebSocket(target.webSocketDebuggerUrl!, configString);
}

export async function reloadViaWebSocket(wsUrl: string): Promise<void> {
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
    }, RELOAD_TIMEOUT);
  });
}
