import { getAIConfig } from '@midscene/core/env';
import {
  AgentOverChromeBridge,
  allConfigFromEnv,
  overrideAIConfig,
} from '@midscene/web/bridge-mode';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PuppeteerBrowserAgent, ensureBrowser } from './puppeteer';
declare global {
  interface Window {
    mcpHelper?: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

type AddWrapType = (
  fn: (args: any) => Promise<any>,
) => (args: any) => Promise<any>;

const wrapError: AddWrapType =
  (fn: (args: any) => Promise<any>) => async (args: any) => {
    try {
      return await fn(args);
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: String(err.message) }],
      };
    }
  };

type MidsceneNavigateArgs = {
  url: string;
  openNewTab?: boolean;
};

export class MidsceneManager {
  private consoleLogs: string[] = [];
  private screenshots = new Map<string, string>();
  private server: McpServer; // Add server instance
  private agent?: AgentOverChromeBridge | PuppeteerBrowserAgent;
  private bridgeMode = getAIConfig('MIDSCENE_USE_BRIDGE_MODE') === '1';
  constructor(server: McpServer) {
    this.server = server;
    this.initEnv();
    this.registerTools();
  }

  private initEnv() {
    const keys = Object.keys(allConfigFromEnv());
    const envOverrides: { [key: string]: string } = {};
    for (const key of keys) {
      const value = process.env[key];
      if (value !== undefined) {
        envOverrides[key] = value;
      }
    }
    overrideAIConfig(envOverrides);
  }

  private async initAgent() {
    if (this.agent) {
      return this.agent;
    }
    if (this.bridgeMode) {
      this.agent = new AgentOverChromeBridge();
    } else {
      // Store the browser instance when using puppeteer
      const { browser, pages } = await ensureBrowser({});
      this.agent = new PuppeteerBrowserAgent(browser, pages[0]);
    }
    return this.agent;
  }

  private registerTools() {
    this.server.tool(
      'midscene_navigate',
      'Navigates the browser to the specified URL. Always opens in the current tab.',
      { url: z.string().describe('URL to navigate to') },
      async ({ url }) => {
        const agent = await this.initAgent();
        await agent.connectNewTabWithUrl(url);
        return {
          content: [{ type: 'text', text: `Navigated to ${url}` }],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_get_tabs',
      'Retrieves a list of all open browser tabs, including their ID, title, and URL.',
      {},
      async () => {
        const agent = await this.initAgent();
        const tabsInfo = await agent.getBrowserTabList();
        return {
          content: [
            {
              type: 'text',
              text: `Current Tabs:\n${JSON.stringify(tabsInfo, null, 2)}`,
            },
          ],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_set_active_tab',
      "Switches the browser's focus to the tab specified by its ID. Use midscene_get_tabs first to find the correct tab ID.",
      { tabId: z.string().describe('The ID of the tab to set as active.') },
      async ({ tabId }) => {
        const agent = await this.initAgent();
        await agent.setActiveTabId(tabId);
        return {
          content: [{ type: 'text', text: `Set active tab to ${tabId}` }],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_achieve_goal',
      'Performs a sequence of browser actions (clicks, inputs, scrolls, navigation) based on a natural language goal description.',
      {
        goal: z
          .string()
          .describe('Describe your target goal in natural language'),
      },
      async ({ goal }) => {
        const agent = await this.initAgent();
        await agent.aiAction(goal);
        return {
          content: [{ type: 'text', text: `Planned to goal: ${goal}` }],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_screenshot',
      'Captures a screenshot of the currently active browser tab and saves it with the given name.',
      {
        name: z.string().describe('Name for the screenshot'),
      },
      async ({ name }) => {
        const agent = await this.initAgent();
        const screenshot = await agent.page.screenshotBase64();
        // Remove the data URL prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        this.screenshots.set(name, screenshot as string);

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot '${name}' taken at 1200x800`,
            } as TextContent,
            {
              type: 'image',
              data: base64Data,
              mimeType: 'image/jpeg',
            } as ImageContent,
          ],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_click',
      'Locates and clicks an element on the current page based on a natural language description (selector).',
      { selector: z.string().describe('Describe the element to click') },
      async ({ selector }) => {
        const agent = await this.initAgent();
        await agent.aiTap(selector);
        return {
          content: [{ type: 'text', text: `Clicked on ${selector}` }],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_scroll',
      'Scrolls the page or a specified element. Can scroll by a fixed amount or until an edge is reached.',
      {
        direction: z
          .enum(['up', 'down', 'left', 'right'])
          .describe('The direction to scroll.'),
        scrollType: z
          .enum(['once', 'untilBottom', 'untilTop', 'untilLeft', 'untilRight'])
          .optional()
          .default('once')
          .describe(
            "Type of scroll: 'once' for a fixed distance, or until reaching an edge.",
          ),
        distance: z
          .number()
          .optional()
          .describe(
            "The distance to scroll in pixels (used with scrollType 'once').",
          ),
        locate: z
          .string()
          .optional()
          .describe(
            'Optional natural language description of the element to scroll. If not provided, scrolls based on current mouse position.',
          ),
        deepThink: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true and 'locate' is provided, uses a two-step AI call to precisely locate the element.",
          ),
      },
      async ({ direction, scrollType, distance, locate, deepThink }) => {
        const agent = await this.initAgent();
        const scrollParam = { direction, scrollType, distance };
        await agent.aiScroll(scrollParam, locate, { deepThink });
        const targetDesc = locate
          ? ` element described by: "${locate}"`
          : ' the page';
        return {
          content: [
            { type: 'text', text: `Scrolled${targetDesc} ${direction}.` },
          ],
        };
      },
    );
    this.server.tool(
      'midscene_input',
      'Inputs text into a specified form field or element identified by a natural language selector.',
      {
        value: z.string().describe('The text to input'),
        selector: z
          .string()
          .describe('Describe the element to input text into'),
      },
      async ({ value, selector }) => {
        const agent = await this.initAgent();
        await agent.aiInput(value, selector);
        return {
          content: [
            { type: 'text', text: `Inputted ${value} into ${selector}` },
          ],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_hover',
      'Moves the mouse cursor to hover over an element identified by a natural language selector.',
      { selector: z.string() },
      async ({ selector }) => {
        const agent = await this.initAgent();
        await agent.aiHover(selector);
        return {
          content: [{ type: 'text', text: `Hovered over ${selector}` }],
          isError: false,
        };
      },
    );
    this.server.tool(
      'midscene_evaluate',
      'Executes arbitrary JavaScript code within the context of the current page and returns the result.',
      { script: z.string() },
      async ({ script }) => {
        const agent = await this.initAgent();
        const res = await agent.evaluateJavaScript(script);
        const text = typeof res === 'string' ? res : JSON.stringify(res);
        return { content: [{ type: 'text', text }] };
      },
    );
  }

  public getConsoleLogs(): string {
    return this.consoleLogs.join('\n');
  }

  public getScreenshot(name: string): string | undefined {
    return this.screenshots.get(name);
  }

  public listScreenshotNames(): string[] {
    return Array.from(this.screenshots.keys());
  }

  public async closeBrowser(): Promise<void> {
    await this.agent?.destroy();
  }
}
