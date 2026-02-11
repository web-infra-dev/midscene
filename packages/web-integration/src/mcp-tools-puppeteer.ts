import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from '@midscene/core';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import type { Browser, Page } from 'puppeteer';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

const ENDPOINT_FILE = join(tmpdir(), 'midscene-puppeteer-endpoint');

/**
 * Persistent Puppeteer browser manager.
 * Launches a detached Chrome and persists the WS endpoint across CLI calls.
 */
const browserManager = {
  activeBrowser: null as Browser | null,

  async getOrLaunch(): Promise<{ browser: Browser; reused: boolean }> {
    const puppeteer = (await import('puppeteer')).default;

    if (existsSync(ENDPOINT_FILE)) {
      try {
        const endpoint = (await readFile(ENDPOINT_FILE, 'utf-8')).trim();
        const browser = await puppeteer.connect({
          browserWSEndpoint: endpoint,
          defaultViewport: null,
        });
        return { browser, reused: true };
      } catch {
        try {
          await unlink(ENDPOINT_FILE);
        } catch {}
      }
    }

    const wsEndpoint = await this.launchDetachedChrome();
    await writeFile(ENDPOINT_FILE, wsEndpoint);

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });
    return { browser, reused: false };
  },

  async closeBrowser(): Promise<void> {
    if (!existsSync(ENDPOINT_FILE)) return;
    try {
      const puppeteer = (await import('puppeteer')).default;
      const endpoint = (await readFile(ENDPOINT_FILE, 'utf-8')).trim();
      const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
      });
      await browser.close();
    } catch {}
    try {
      await unlink(ENDPOINT_FILE);
    } catch {}
  },

  disconnect(): void {
    if (this.activeBrowser) {
      this.activeBrowser.disconnect();
      this.activeBrowser = null;
    }
  },

  async launchDetachedChrome(): Promise<string> {
    const puppeteer = (await import('puppeteer')).default;
    const chromePath = puppeteer.executablePath();
    const args = [
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-background-networking',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1280,800',
      '--force-color-profile=srgb',
    ];

    const proc = spawn(chromePath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    proc.unref();

    return new Promise<string>((resolve, reject) => {
      let output = '';
      const onData = (data: Buffer) => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          proc.stderr!.removeListener('data', onData);
          resolve(match[1]);
        }
      };
      proc.stderr!.on('data', onData);
      setTimeout(() => reject(new Error('Chrome launch timeout')), 15000);
    });
  },
};

/**
 * Tools manager for Web Puppeteer-mode MCP.
 * Uses a persistent headless Chrome browser that survives across CLI calls.
 */
export class WebPuppeteerMidsceneTools extends BaseMidsceneTools<PuppeteerAgent> {
  protected createTemporaryDevice() {
    return new StaticPage({
      screenshotBase64: '',
      size: { width: 1920, height: 1080 },
    });
  }

  protected async ensureAgent(
    navigateToUrl?: string,
  ): Promise<PuppeteerAgent> {
    // Re-init if URL provided
    if (this.agent && navigateToUrl) {
      try {
        await this.agent?.destroy?.();
      } catch {}
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    const { browser, reused } = await browserManager.getOrLaunch();
    browserManager.activeBrowser = browser;

    const pages = await browser.pages();
    let page: Page;

    if (navigateToUrl) {
      page = await browser.newPage();
      await page.goto(navigateToUrl, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
    } else {
      // Reuse the last web page
      const webPages = pages.filter((p) => /^https?:\/\//.test(p.url()));
      page =
        webPages.length > 0
          ? webPages[webPages.length - 1]
          : pages[pages.length - 1] || (await browser.newPage());

      if (reused) {
        await page.bringToFront();
      }
    }

    this.agent = new PuppeteerAgent(page);
    return this.agent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description:
          'Connect to a web page. Opens a new tab with the given URL, or reuses the current page.',
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
            } catch {}
            this.agent = undefined;
          }

          this.agent = await this.ensureAgent(url);

          const screenshot = await this.agent.page?.screenshotBase64();
          const label = url ?? 'current page';

          return {
            content: [
              { type: 'text', text: `Connected to: ${label}` },
              ...(screenshot
                ? this.buildScreenshotContent(screenshot)
                : []),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page. The browser stays running for future calls.',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
          }
          browserManager.disconnect();
          return this.buildTextResult(
            'Disconnected from web page (browser still running)',
          );
        },
      },
      {
        name: 'web_close',
        description: 'Close the browser completely and release all resources.',
        schema: {},
        handler: async () => {
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
          }
          await browserManager.closeBrowser();
          return this.buildTextResult('Browser closed');
        },
      },
    ];
  }
}
