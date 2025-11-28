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
    // Import PuppeteerWebPage class using dynamic ESM import
    // This is intentionally synchronous despite the async nature of createTemporaryDevice
    // because we need the class constructor immediately for tool initialization
    // The alternative would be to make all tool initialization async, which is a larger refactor
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        if (this.agent.destroy) {
          await this.agent.destroy();
        }
      } catch (e) {
        console.debug('Failed to destroy agent during re-init:', e);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Choose bridge or puppeteer mode
    // In bridge mode, we need a URL to connect to
    // If no URL provided, agent creation will be deferred until first tool use
    if (!this.puppeteerMode) {
      if (!openNewTabWithUrl) {
        throw new Error(
          'Bridge mode requires a URL. Use web_connect tool to connect to a page first.',
        );
      }
      this.agent = (await this.initAgentByBridgeMode(
        openNewTabWithUrl,
      )) as unknown as BaseAgent;
    } else {
      this.agent = (await this.initPuppeteerAgent(
        openNewTabWithUrl,
      )) as unknown as BaseAgent;
    }

    return this.agent;
  }

  private async initAgentByBridgeMode(
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

          const { parseBase64 } = await import('@midscene/shared/img');
          const { mimeType, body } = parseBase64(screenshot);

          return {
            content: [
              {
                type: 'text',
                text: `Connected to: ${url}`,
              },
              {
                type: 'image',
                data: body,
                mimeType,
              },
            ],
          };
        },
        autoDestroy: false,
      },
    ];
  }
}
