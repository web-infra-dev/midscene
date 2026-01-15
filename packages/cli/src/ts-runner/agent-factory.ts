import type { PuppeteerAgent } from '@midscene/web/puppeteer';
import type { Browser, Page } from 'puppeteer';
import type { CdpConfig, LaunchConfig } from './types';

// Track all created browsers for cleanup
const activeBrowsers: Set<{ browser: Browser; isOwned: boolean }> = new Set();

async function discoverLocal(port = 9222): Promise<string> {
  const errorMessage = `Cannot connect to local Chrome (port ${port}).

Midscene connects to Chrome using its remote debugging protocol, which must be enabled.
Please start Chrome with remote debugging enabled using one of the following commands:
  macOS: open -a "Google Chrome" --args --remote-debugging-port=${port}
  Linux: google-chrome --remote-debugging-port=${port}
  Windows: chrome.exe --remote-debugging-port=${port}

For more information, see: https://midscenejs.com/automate-with-scripts-in-yaml.html`;

  let response: Response;
  try {
    response = await fetch(`http://localhost:${port}/json/version`);
  } catch {
    throw new Error(errorMessage);
  }
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  const info = (await response.json()) as { webSocketDebuggerUrl: string };
  return info.webSocketDebuggerUrl;
}

function validateWebSocketEndpoint(endpoint: string): void {
  if (!/^wss?:\/\//.test(endpoint)) {
    throw new Error(
      `Invalid WebSocket endpoint URL: "${endpoint}". Expected a URL starting with "ws://" or "wss://".`,
    );
  }
}

function resolveEndpoint(config?: CdpConfig): string | Promise<string> {
  if (!config) {
    return discoverLocal();
  }

  if (typeof config === 'string') {
    validateWebSocketEndpoint(config);
    return config;
  }

  validateWebSocketEndpoint(config.endpoint);

  if (!config.apiKey) {
    return config.endpoint;
  }

  let url: URL;
  try {
    url = new URL(config.endpoint);
  } catch {
    throw new Error(
      `Invalid WebSocket endpoint URL: "${config.endpoint}". Please provide a valid URL.`,
    );
  }
  url.searchParams.set('apiKey', config.apiKey);
  return url.toString();
}

/**
 * Connect to an existing Chrome browser via CDP and return a PuppeteerAgent.
 */
export async function connectAgent(
  config?: CdpConfig,
): Promise<PuppeteerAgent> {
  const puppeteer = await import('puppeteer');
  const { PuppeteerAgent } = await import('@midscene/web/puppeteer');

  const endpoint = await resolveEndpoint(config);

  const browser = await puppeteer.default.connect({
    browserWSEndpoint: endpoint,
  });
  activeBrowsers.add({ browser, isOwned: false });

  const pages = await browser.pages();
  let page: Page = pages[0] || (await browser.newPage());

  // Handle tab selection if specified
  if (
    typeof config === 'object' &&
    (config.tabUrl || typeof config.tabIndex === 'number')
  ) {
    if (config.tabUrl) {
      const found = pages.find((p) => p.url().includes(config.tabUrl!));
      if (found) page = found;
    } else if (typeof config.tabIndex === 'number' && pages[config.tabIndex]) {
      page = pages[config.tabIndex];
    }
  }

  return new PuppeteerAgent(page);
}

/**
 * Launch a new Chrome browser and return a PuppeteerAgent.
 */
export async function launchAgent(
  config: LaunchConfig = {},
): Promise<PuppeteerAgent> {
  const puppeteer = await import('puppeteer');
  const { PuppeteerAgent } = await import('@midscene/web/puppeteer');

  const browser = await puppeteer.default.launch({
    headless: !config.headed,
  });
  activeBrowsers.add({ browser, isOwned: true });

  const page = await browser.newPage();

  if (config.viewport) {
    await page.setViewport(config.viewport);
  }

  if (config.url) {
    await page.goto(config.url, { waitUntil: 'domcontentloaded' });
  }

  return new PuppeteerAgent(page);
}

/**
 * Cleanup all active browser connections.
 */
export async function cleanup(): Promise<void> {
  const cleanupPromises: Promise<void>[] = [];

  for (const { browser, isOwned } of activeBrowsers) {
    if (isOwned) {
      cleanupPromises.push(browser.close().catch(() => {}));
    } else {
      browser.disconnect();
    }
  }

  await Promise.all(cleanupPromises);
  activeBrowsers.clear();
}
