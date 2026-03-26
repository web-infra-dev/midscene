import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScreenshotItem, z } from '@midscene/core';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { PROXY_ENDPOINT_FILE, PROXY_PID_FILE } from './cdp-proxy-constants';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

/**
 * Check if a previously spawned proxy process is still alive.
 */
function isProxyAlive(): boolean {
  if (!existsSync(PROXY_PID_FILE)) return false;
  try {
    const pid = Number(readFileSync(PROXY_PID_FILE, 'utf-8').trim());
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the proxy endpoint written by cdp-proxy.ts.
 */
function readProxyEndpoint(): string | null {
  if (!existsSync(PROXY_ENDPOINT_FILE)) return null;
  try {
    return readFileSync(PROXY_ENDPOINT_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Spawn the CDP proxy process and wait for it to print the endpoint.
 */
function spawnProxy(chromeEndpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proxyScript = join(__dirname, 'cdp-proxy.js');
    const proc = spawn(process.execPath, [proxyScript, chromeEndpoint], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    proc.unref();

    let output = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Proxy startup timeout (10s)'));
      }
    }, 10000);

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.endpoint && !settled) {
            settled = true;
            clearTimeout(timer);
            proc.stdout!.removeListener('data', onData);
            resolve(parsed.endpoint);
            return;
          }
        } catch {
          // stdout may contain non-JSON lines during startup — skip them
        }
      }
    };
    proc.stdout!.on('data', onData);

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to spawn proxy: ${err.message}`));
      }
    });
    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Proxy exited with code ${code} before ready`));
      }
    });
  });
}

/**
 * Get the proxy endpoint, spawning the proxy if needed.
 * Falls back to direct connection if proxy cannot be started.
 */
async function getProxyEndpoint(chromeEndpoint: string): Promise<string> {
  // If proxy is alive and endpoint file exists, reuse it
  if (isProxyAlive()) {
    const endpoint = readProxyEndpoint();
    if (endpoint) return endpoint;
  }

  // Spawn a new proxy
  try {
    return await spawnProxy(chromeEndpoint);
  } catch (err) {
    console.warn(
      `[cdp] proxy failed, falling back to direct connection: ${err}`,
    );
    return chromeEndpoint;
  }
}

/**
 * Tools manager for Web CDP-mode MCP.
 * Connects to an existing Chrome browser via CDP (Chrome DevTools Protocol) endpoint.
 * Unlike WebPuppeteerMidsceneTools which launches its own Chrome, this connects
 * to a browser that is already running with remote debugging enabled.
 *
 * Uses a persistent WebSocket proxy to avoid repeated Chrome permission popups
 * when Chrome's settings-based remote debugging is used.
 */
export class WebCdpMidsceneTools extends BaseMidsceneTools<PuppeteerAgent> {
  private cdpEndpoint: string;
  private activeBrowser: Browser | null = null;

  constructor(cdpEndpoint: string) {
    super();
    this.cdpEndpoint = cdpEndpoint;
  }

  protected createTemporaryDevice() {
    return new StaticPage({
      screenshot: ScreenshotItem.create('', Date.now()),
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
    });
  }

  protected async ensureAgent(navigateToUrl?: string): Promise<PuppeteerAgent> {
    // Re-init if URL provided
    if (this.agent && navigateToUrl) {
      try {
        await this.agent?.destroy?.();
      } catch (error) {
        console.debug('Failed to destroy agent during re-init:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Connect via proxy to avoid repeated Chrome permission popups
    if (!this.activeBrowser) {
      const endpoint = await getProxyEndpoint(this.cdpEndpoint);
      this.activeBrowser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null,
      });
    }

    const browser = this.activeBrowser;
    const pages = await browser.pages();
    const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
    let page: Page;

    if (navigateToUrl) {
      if (webPages.length > 0) {
        // Reuse an existing page and navigate it — avoids creating invisible
        // tabs when Chrome uses settings-based remote debugging (no HTTP
        // discovery endpoints, /devtools/page/* returns 403).
        page = webPages[webPages.length - 1];
        await page.bringToFront();
        await page.goto(navigateToUrl, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
      } else {
        // No existing web pages — fall back to creating a new tab
        page = await browser.newPage();
        await page.goto(navigateToUrl, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
      }
    } else {
      // Reuse the last web page
      page =
        webPages.length > 0
          ? webPages[webPages.length - 1]
          : pages[pages.length - 1] || (await browser.newPage());

      await page.bringToFront();
    }

    this.agent = new PuppeteerAgent(page as unknown as PuppeteerPage);
    return this.agent;
  }

  public async destroy(): Promise<void> {
    await super.destroy();
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description:
          'Connect to a web page via CDP. Opens a new tab with the given URL, or reuses the current page.',
        schema: {
          url: z
            .string()
            .url()
            .optional()
            .describe('URL to open in new tab (omit to use current page)'),
        },
        handler: async (args) => {
          const { url } = args as { url?: string };

          // Destroy existing agent
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (e) {
              console.debug('Failed to destroy agent during connect:', e);
            }
            this.agent = undefined;
          }

          this.agent = await this.ensureAgent(url);

          const screenshot = await this.agent.page?.screenshotBase64();
          const label = url ?? 'current page';

          return {
            content: [
              { type: 'text', text: `Connected via CDP to: ${label}` },
              ...(screenshot ? this.buildScreenshotContent(screenshot) : []),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page. The browser stays running (managed externally).',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (e) {
              console.debug('Failed to destroy agent during disconnect:', e);
            }
            this.agent = undefined;
          }
          if (this.activeBrowser) {
            this.activeBrowser.disconnect();
            this.activeBrowser = null;
          }
          return this.buildTextResult(
            'Disconnected from web page (browser still running externally)',
          );
        },
      },
    ];
  }
}
