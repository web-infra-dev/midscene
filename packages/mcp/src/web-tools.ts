import { z } from '@midscene/core';
import {
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { type PuppeteerBrowserAgent, ensureBrowser } from './puppeteer';

export class WebMidsceneTools extends BaseMidsceneTools {
  private puppeteerMode = globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_MCP_USE_PUPPETEER_MODE,
  );

  protected getDefaultActionSpace() {
    // Provide default Web action space when browser is not connected
    // This allows Codex to see all available tools even when browser isn't running
    return [
      { name: 'Tap', description: 'Tap the element' },
      { name: 'RightClick', description: 'Right click the element' },
      { name: 'DoubleClick', description: 'Double click the element' },
      { name: 'Hover', description: 'Move the mouse to the element' },
      { name: 'Input', description: 'Input the value into the element' },
      { name: 'KeyboardPress', description: 'Press a key or key combination, like "Enter", "Tab", "Escape", or "Control+A", "Shift+Enter". Do not use this to type text.' },
      { name: 'Scroll', description: 'Scroll the page or an element. The direction to scroll, the scroll type, and the distance to scroll. The distance is the number of pixels to scroll. If not specified, use `down` direction, `once` scroll type, and `null` distance.' },
      { name: 'DragAndDrop', description: 'Drag and drop the element' },
      { name: 'LongPress', description: 'Long press the element' },
      { name: 'Swipe', description: 'Perform a swipe gesture. You must specify either "end" (target location) or "distance" + "direction" - they are mutually exclusive. Use "end" for precise location-based swipes, or "distance" + "direction" for relative movement.' },
      { name: 'ClearInput', description: 'the position of the placeholder or text content in the target input field. If there is no content, locate the center of the input field.' },
      { name: 'Navigate', description: 'Navigate the browser to a specified URL. Opens the URL in the current tab.' },
      { name: 'Reload', description: 'Reload the current page' },
      { name: 'GoBack', description: 'Navigate back in browser history' },
    ];
  }

  protected async ensureAgent(openNewTabWithUrl?: string): Promise<any> {
    // Re-init if URL provided
    if (this.agent && openNewTabWithUrl) {
      try {
        await this.agent.destroy();
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
