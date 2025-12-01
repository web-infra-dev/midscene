import { z } from '@midscene/core';
import {
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import {
  type BaseAgent,
  BaseMidsceneTools,
  type ToolDefinition,
} from '@midscene/shared/mcp';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { type PuppeteerBrowserAgent, ensureBrowser } from './puppeteer';

export class WebMidsceneTools extends BaseMidsceneTools {
  private puppeteerMode = globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_MCP_USE_PUPPETEER_MODE,
  );

  protected createTemporaryDevice() {
    // Synchronous require needed for tool initialization
    const { PuppeteerWebPage } = require('@midscene/web');

    // Create minimal mock page object that satisfies the interface
    // actionSpace() method doesn't actually use these methods, just needs the structure
    const mockPage = {
      url: () => 'about:blank',
      mouse: {
        click: async () => {},
        wheel: async () => {},
        move: async () => {},
      },
      keyboard: {
        type: async () => {},
        press: async () => {},
      },
    };

    // Create temporary PuppeteerWebPage instance to read actionSpace
    // The instance doesn't connect to real browser, just returns action definitions
    return new PuppeteerWebPage(mockPage as any, {});
  }

  protected async ensureAgent(openNewTabWithUrl?: string): Promise<BaseAgent> {
    // Re-init if URL provided
    if (this.agent && openNewTabWithUrl) {
      try {
        await this.agent?.destroy?.();
      } catch (error) {
        console.debug('Failed to destroy agent during re-init:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Choose bridge or puppeteer mode
    if (!this.puppeteerMode) {
      // Bridge mode requires a URL to connect to browser
      if (!openNewTabWithUrl) {
        throw new Error(
          'Bridge mode requires a URL. Use web_connect tool to connect to a page first.',
        );
      }
      this.agent = (await this.initBridgeModeAgent(
        openNewTabWithUrl,
      )) as unknown as BaseAgent;
    } else {
      // Puppeteer mode can auto-start with default page
      this.agent = (await this.initPuppeteerAgent(
        openNewTabWithUrl,
      )) as unknown as BaseAgent;
    }

    return this.agent;
  }

  private async initBridgeModeAgent(
    url?: string,
  ): Promise<AgentOverChromeBridge> {
    const agent = new AgentOverChromeBridge({ closeConflictServer: true });

    if (!url) {
      await agent.connectCurrentTab();
    } else {
      await agent.connectNewTabWithUrl(url);
    }

    return agent;
  }

  private async initPuppeteerAgent(
    url?: string,
  ): Promise<PuppeteerBrowserAgent> {
    const { browser } = await ensureBrowser({});
    const newPage = await browser.newPage();

    if (url) {
      await newPage.goto(url);
    } else {
      await newPage.goto('https://google.com');
    }

    const { PuppeteerBrowserAgent } = await import('./puppeteer.js');
    return new PuppeteerBrowserAgent(browser, newPage);
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description: 'Connect to web page by opening new tab with URL',
        schema: {
          url: z.string().url().describe('URL to connect to'),
        },
        handler: async (args) => {
          const { url } = args as { url: string };
          const agent = await this.ensureAgent(url);
          const screenshot = await agent.page?.screenshotBase64();
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
        autoDestroy: false,
      },
    ];
  }
}
