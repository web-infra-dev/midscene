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

  // Maximum viewport dimensions
  private static readonly MAX_VIEWPORT_WIDTH = 1280;
  private static readonly MAX_VIEWPORT_HEIGHT = 720;

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

    // Create browser context with no fixed viewport initially
    // This allows us to detect the available screen space
    this.context = await this.browser.newContext({
      viewport: null,
    });

    // Create page and navigate
    const page: PlaywrightPage = await this.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Detect available screen space and set viewport to fit screen but cap at max dimensions
    await this.setAdaptiveViewport(page);

    // Create PlaywrightAgent
    const agent = new PlaywrightAgent(page);
    return agent;
  }

  /**
   * Set viewport size that adapts to screen size but is capped at maximum dimensions.
   * On small screens: viewport fits available space
   * On large screens: viewport is capped at MAX_VIEWPORT_WIDTH x MAX_VIEWPORT_HEIGHT
   */
  private async setAdaptiveViewport(page: PlaywrightPage): Promise<void> {
    try {
      // Get current window inner dimensions from the browser
      // With viewport: null, innerWidth/innerHeight reflect the natural browser window size
      const windowSize: { innerWidth: number; innerHeight: number } =
        await page.evaluate('({ innerWidth, innerHeight })');

      // Calculate viewport: use current window size but cap at maximum dimensions
      const viewportWidth = Math.min(
        windowSize.innerWidth,
        PlaywrightMidsceneTools.MAX_VIEWPORT_WIDTH,
      );
      const viewportHeight = Math.min(
        windowSize.innerHeight,
        PlaywrightMidsceneTools.MAX_VIEWPORT_HEIGHT,
      );

      await page.setViewportSize({
        width: viewportWidth,
        height: viewportHeight,
      });

      debug(
        `Set adaptive viewport: ${viewportWidth}x${viewportHeight} (window: ${windowSize.innerWidth}x${windowSize.innerHeight})`,
      );
    } catch (error) {
      // If detection fails, viewport: null already ensures it fits the host window
      debug('Failed to detect window size, keeping natural viewport:', error);
    }
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
