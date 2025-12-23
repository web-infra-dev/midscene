import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import type { PlaywrightAgent } from '@midscene/web/playwright';
import type { Browser, BrowserContext } from 'playwright';

const debug = getDebug('mcp:playwright-tools');

// Use 'any' to avoid version conflicts between different playwright-core versions
// The runtime types are compatible, but TypeScript sees different versions as incompatible
type PlaywrightPage = any;

/**
 * Playwright-specific tools manager
 * Extends BaseMidsceneTools to provide Playwright browser automation tools
 */
export class PlaywrightMidsceneTools extends BaseMidsceneTools<PlaywrightAgent> {
  private browser?: Browser;
  private context?: BrowserContext;

  protected createTemporaryDevice() {
    // Use require to avoid type incompatibility with DeviceAction vs ActionSpaceItem
    // StaticPage.actionSpace() returns DeviceAction[] which is compatible at runtime
    const { StaticPage } = require('@midscene/web/static');
    return new StaticPage();
  }

  protected async ensureAgent(url?: string): Promise<PlaywrightAgent> {
    // Re-init if URL provided (navigate to new page)
    if (this.agent && url) {
      try {
        await this.closeBrowser();
      } catch (error) {
        debug('Failed to close browser during re-init:', error);
      }
    }

    if (this.agent) {
      return this.agent;
    }

    // Playwright mode requires a URL to connect
    if (!url) {
      throw new Error(
        'Playwright mode requires a URL. Use web_connect tool to connect to a page first.',
      );
    }

    debug('Launching browser and navigating to:', url);
    this.agent = await this.launchAndConnect(url);
    return this.agent;
  }

  /**
   * Launch Playwright browser and navigate to URL
   */
  private async launchAndConnect(url: string): Promise<PlaywrightAgent> {
    const { chromium } = await import('playwright');
    const { PlaywrightAgent } = await import('@midscene/web/playwright');

    // Launch browser in headed mode for visibility
    this.browser = await chromium.launch({
      headless: false,
    });

    // Create browser context
    this.context = await this.browser.newContext();

    // Create page and navigate
    const page: PlaywrightPage = await this.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Create PlaywrightAgent
    const agent = new PlaywrightAgent(page);
    return agent;
  }

  /**
   * Close browser and cleanup resources
   * Override base class method to also close browser and context
   */
  public override async closeBrowser(): Promise<void> {
    try {
      await this.agent?.destroy();
    } catch (error) {
      debug('Failed to destroy agent:', error);
    }
    this.agent = undefined;

    try {
      await this.context?.close();
    } catch (error) {
      debug('Failed to close context:', error);
    }
    this.context = undefined;

    try {
      await this.browser?.close();
    } catch (error) {
      debug('Failed to close browser:', error);
    }
    this.browser = undefined;
  }

  /**
   * Provide Playwright-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description:
          'Launch browser and connect to web page by URL. This will open a new Chromium browser window.',
        schema: {
          url: z.string().url().describe('URL to navigate to'),
        },
        handler: async (args) => {
          const { url } = args as { url: string };
          const agent = await this.ensureAgent(url);
          const screenshot = await agent.page.screenshotBase64();

          if (!screenshot) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Connected to: ${url}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Connected to: ${url}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
          };
        },
        autoDestroy: false, // Keep browser alive for subsequent operations
      },
      {
        name: 'web_close',
        description: 'Close the browser and end the automation session.',
        schema: {},
        handler: async () => {
          await this.closeBrowser();

          return {
            content: [
              {
                type: 'text',
                text: 'Browser closed successfully.',
              },
            ],
          };
        },
        autoDestroy: false,
      },
    ];
  }
}
