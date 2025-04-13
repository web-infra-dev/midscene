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
        // Define a directory to store screenshots
        const screenshotsDir = path.resolve(process.cwd(), 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        // Construct the output file path
        const filePath = path.join(
          screenshotsDir,
          `${args.name || 'screenshot'}.jpeg`,
        );
        const screenText = path.join(
          screenshotsDir,
          `${args.name || 'screenshot'}.txt`,
        );
        // Convert the base64 string to a binary buffer and write it as an image file
        const imageBuffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, imageBuffer);
        fs.writeFileSync(screenText, base64Data);
        console.log('Saved screenshot to:', filePath);

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
              data: screenshot.replace('data:image/jpeg;base64,', ''),
              mimeType: 'image/jpeg',
            } as ImageContent,
          ],
          isError: false,
        };
      }

      // case 'puppeteer_click':
      //   try {
      //     await agent.page.click(args.selector);
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Clicked: ${args.selector}`,
      //         },
      //       ],
      //       isError: false,
      //     };
      //   } catch (error) {
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Failed to click ${args.selector}: ${(error as Error).message}`,
      //         },
      //       ],
      //       isError: true,
      //     };
      //   }

      // case 'puppeteer_fill':
      //   try {
      //     await page.waitForSelector(args.selector);
      //     await page.type(args.selector, args.value);
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Filled ${args.selector} with: ${args.value}`,
      //         },
      //       ],
      //       isError: false,
      //     };
      //   } catch (error) {
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Failed to fill ${args.selector}: ${(error as Error).message}`,
      //         },
      //       ],
      //       isError: true,
      //     };
      //   }

      // case 'puppeteer_select':
      //   try {
      //     await page.waitForSelector(args.selector);
      //     await page.select(args.selector, args.value);
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Selected ${args.selector} with: ${args.value}`,
      //         },
      //       ],
      //       isError: false,
      //     };
      //   } catch (error) {
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Failed to select ${args.selector}: ${(error as Error).message}`,
      //         },
      //       ],
      //       isError: true,
      //     };
      //   }

      // case 'puppeteer_hover':
      //   try {
      //     await page.waitForSelector(args.selector);
      //     await page.hover(args.selector);
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Hovered ${args.selector}`,
      //         },
      //       ],
      //       isError: false,
      //     };
      //   } catch (error) {
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Failed to hover ${args.selector}: ${(error as Error).message}`,
      //         },
      //       ],
      //       isError: true,
      //     };
      //   }

      // case 'puppeteer_evaluate':
      //   try {
      //     await page.evaluate(() => {
      //       //@ts-ignore
      //       window.mcpHelper = {
      //         logs: [],
      //         originalConsole: { ...console },
      //       };

      //       ['log', 'info', 'warn', 'error'].forEach((method) => {
      //         (console as any)[method] = (...args: any[]) => {
      //           //@ts-ignore
      //           window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
      //           //@ts-ignore
      //           (window.mcpHelper.originalConsole as any)[method](...args);
      //         };
      //       });
      //     });

      //     const result = await page.evaluate(args.script);

      //     const logs = await page.evaluate(() => {
      //       //@ts-ignore
      //       Object.assign(console, window.mcpHelper.originalConsole);
      //       //@ts-ignore
      //       const logs = window.mcpHelper.logs;
      //       //@ts-ignore
      //       window.mcpHelper = undefined;
      //       return logs;
      //     });

      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`,
      //         },
      //       ],
      //       isError: false,
      //     };
      //   } catch (error) {
      //     return {
      //       content: [
      //         {
      //           type: 'text',
      //           text: `Script execution failed: ${(error as Error).message}`,
      //         },
      //       ],
      //       isError: true,
      //     };
      //   }

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
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
