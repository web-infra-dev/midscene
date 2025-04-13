import fs from 'node:fs';
import path from 'node:path';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type {
  CallToolResult,
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { deepMerge } from './utils.js';

const DANGEROUS_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--single-process',
  '--disable-web-security',
  '--ignore-certificate-errors',
  '--disable-features=IsolateOrigins',
  '--disable-site-isolation-trials',
  '--allow-running-insecure-content',
];

declare global {
  interface Window {
    mcpHelper?: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

export class PuppeteerManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private consoleLogs: string[] = [];
  private screenshots = new Map<string, string>();
  private previousLaunchOptions: any = null;
  private server: Server<any, any>; // Add server instance
  private agent: AgentOverChromeBridge;
  constructor(server: Server<any, any>) {
    this.server = server;
    this.agent = new AgentOverChromeBridge();
  }

  public async handleToolCall(
    name: string,
    args: any,
  ): Promise<CallToolResult> {
    switch (name) {
      case 'puppeteer_navigate':
        // await page.goto(args.url);
        await this.agent.connectNewTabWithUrl(args.url);
        return {
          content: [
            {
              type: 'text',
              text: `Navigated to ${args.url}`,
            },
          ],
          isError: false,
        };

      case 'puppeteer_screenshot': {
        await this.agent.connectCurrentTab();
        const screenshot = await this.agent.page.screenshotBase64();
        // Remove the data URL prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        this.screenshots.set(args.name, screenshot as string);
        this.server.notification({
          method: 'notifications/resources/list_changed',
        });

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot '${args.name}' taken at 1200x800`,
            } as TextContent,
            {
              type: 'image',
              data: base64Data,
              mimeType: 'image/jpeg',
            } as ImageContent,
          ],
          isError: false,
        };
      }

      case 'puppeteer_evaluate':
        try {
          await this.agent.connectCurrentTab();
          await this.agent.page.evaluate(`(function() {
            window.mcpHelper = {
              logs: [],
              originalConsole: { ...console },
            };
            ['log', 'info', 'warn', 'error'].forEach((method) => {
              console[method] = (...args) => {
                window.mcpHelper.logs.push('['+method +']' + args.join(' '));
                window.mcpHelper.originalConsole[method](...args);
              };
            });
            return window.mcpHelper;
          })()`);

          const result = await this.agent.page.evaluate(args.script);

          const logs = await this.agent.page.evaluate(`(function() {
            Object.assign(console, window.mcpHelper.originalConsole);
            const logs = window.mcpHelper.logs;
            window.mcpHelper = undefined;
            return logs;
          })()`);

          return {
            content: [
              {
                type: 'text',
                text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${JSON.stringify(logs, null, 2)}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Script execution failed: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

      default:
        // This case should ideally not be reached if called correctly from index.ts
        return {
          content: [
            {
              type: 'text',
              text: `Unknown Puppeteer tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
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
    await this.agent.destroy();
  }
}
