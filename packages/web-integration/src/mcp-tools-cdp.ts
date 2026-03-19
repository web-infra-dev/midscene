import { ScreenshotItem, z } from '@midscene/core';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import type { Page as PuppeteerPage } from 'puppeteer';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { PuppeteerAgent } from './puppeteer';
import { StaticPage } from './static';

/**
 * Tools manager for Web CDP-mode MCP.
 * Connects to an existing Chrome browser via CDP (Chrome DevTools Protocol) endpoint.
 * Unlike WebPuppeteerMidsceneTools which launches its own Chrome, this connects
 * to a browser that is already running with remote debugging enabled.
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

    // Connect to the existing browser via CDP endpoint
    if (!this.activeBrowser) {
      this.activeBrowser = await puppeteer.connect({
        browserWSEndpoint: this.cdpEndpoint,
        defaultViewport: null,
      });
    }

    const browser = this.activeBrowser;
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
            } catch {}
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
            } catch {}
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
