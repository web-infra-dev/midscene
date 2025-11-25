import {
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { z } from 'zod';
import { type PuppeteerBrowserAgent, ensureBrowser } from './puppeteer';

export class WebMidsceneTools extends BaseMidsceneTools {
  private puppeteerMode = globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_MCP_USE_PUPPETEER_MODE,
  );

  protected async ensureAgent(openNewTabWithUrl?: string): Promise<any> {
    // Re-init if URL provided
    if (this.agent && openNewTabWithUrl) {
      try {
        await this.agent.destroy();
      } catch (e) {}
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Choose bridge or puppeteer mode
    if (!this.puppeteerMode) {
      this.agent = await this.initAgentByBridgeMode(openNewTabWithUrl);
    } else {
      this.agent = await this.initPuppeteerAgent(openNewTabWithUrl);
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
        handler: async ({ url }) => {
          const agent = await this.ensureAgent(url);
          const screenshot = await agent.page.screenshotBase64();
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
            isError: false,
          };
        },
        autoDestroy: false,
      },
    ];
  }
}
