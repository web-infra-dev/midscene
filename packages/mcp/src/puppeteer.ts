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

  constructor(server: Server<any, any>) {
    this.server = server;
  }

  public async ensureBrowser({
    launchOptions,
    allowDangerous,
  }: any): Promise<Page> {
    let envConfig = {};
    try {
      envConfig = JSON.parse(process.env.PUPPETEER_LAUNCH_OPTIONS || '{}');
    } catch (error: any) {
      console.warn(
        'Failed to parse PUPPETEER_LAUNCH_OPTIONS:',
        error?.message || error,
      );
    }

    const mergedConfig = deepMerge(envConfig, launchOptions || {});

    if (mergedConfig?.args) {
      const dangerousArgs = mergedConfig.args?.filter?.((arg: string) =>
        DANGEROUS_ARGS.some((dangerousArg: string) =>
          arg.startsWith(dangerousArg),
        ),
      );
      if (
        dangerousArgs?.length > 0 &&
        !(allowDangerous || process.env.ALLOW_DANGEROUS === 'true')
      ) {
        throw new Error(
          `Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Found from environment variable and tool call argument. Set allowDangerous: true in the tool call arguments to override.`,
        );
      }
    }

    try {
      if (
        (this.browser && !this.browser.connected) ||
        (launchOptions &&
          JSON.stringify(launchOptions) !==
            JSON.stringify(this.previousLaunchOptions))
      ) {
        await this.browser?.close();
        this.browser = null;
      }
    } catch (error) {
      this.browser = null;
    }

    this.previousLaunchOptions = launchOptions;

    if (!this.browser) {
      const npx_args = { headless: false };
      const docker_args = {
        headless: true,
        args: ['--no-sandbox', '--single-process', '--no-zygote'],
      };
      this.browser = await puppeteer.launch(
        deepMerge(
          process.env.DOCKER_CONTAINER ? docker_args : npx_args,
          mergedConfig,
        ),
      );
      const pages = await this.browser.pages();
      this.page = pages[0];

      this.page.on('console', (msg) => {
        const logEntry = `[${msg.type()}] ${msg.text()}`;
        this.consoleLogs.push(logEntry);
        // Use the passed server instance
        this.server.notification({
          method: 'notifications/resources/updated',
          params: { uri: 'console://logs' },
        });
      });
    }
    return this.page!;
  }

  public async handleToolCall(
    name: string,
    args: any,
  ): Promise<CallToolResult> {
    const page = await this.ensureBrowser(args);

    switch (name) {
      case 'puppeteer_navigate':
        await page.goto(args.url);
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
        const width = args.width ?? 800;
        const height = args.height ?? 600;
        await page.setViewport({ width, height });

        const screenshot = await (args.selector
          ? (await page.$(args.selector))?.screenshot({ encoding: 'base64' })
          : page.screenshot({ encoding: 'base64', fullPage: false }));

        if (!screenshot) {
          return {
            content: [
              {
                type: 'text',
                text: args.selector
                  ? `Element not found: ${args.selector}`
                  : 'Screenshot failed',
              },
            ],
            isError: true,
          };
        }

        this.screenshots.set(args.name, screenshot as string);
        this.server.notification({
          method: 'notifications/resources/list_changed',
        });

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot '${args.name}' taken at ${width}x${height}`,
            } as TextContent,
            {
              type: 'image',
              data: screenshot,
              mimeType: 'image/png',
            } as ImageContent,
          ],
          isError: false,
        };
      }

      case 'puppeteer_click':
        try {
          await page.click(args.selector);
          return {
            content: [
              {
                type: 'text',
                text: `Clicked: ${args.selector}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to click ${args.selector}: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

      case 'puppeteer_fill':
        try {
          await page.waitForSelector(args.selector);
          await page.type(args.selector, args.value);
          return {
            content: [
              {
                type: 'text',
                text: `Filled ${args.selector} with: ${args.value}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to fill ${args.selector}: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

      case 'puppeteer_select':
        try {
          await page.waitForSelector(args.selector);
          await page.select(args.selector, args.value);
          return {
            content: [
              {
                type: 'text',
                text: `Selected ${args.selector} with: ${args.value}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to select ${args.selector}: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

      case 'puppeteer_hover':
        try {
          await page.waitForSelector(args.selector);
          await page.hover(args.selector);
          return {
            content: [
              {
                type: 'text',
                text: `Hovered ${args.selector}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to hover ${args.selector}: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }

      case 'puppeteer_evaluate':
        try {
          await page.evaluate(() => {
            //@ts-ignore
            window.mcpHelper = {
              logs: [],
              originalConsole: { ...console },
            };

            ['log', 'info', 'warn', 'error'].forEach((method) => {
              (console as any)[method] = (...args: any[]) => {
                //@ts-ignore
                window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
                //@ts-ignore
                (window.mcpHelper.originalConsole as any)[method](...args);
              };
            });
          });

          const result = await page.evaluate(args.script);

          const logs = await page.evaluate(() => {
            //@ts-ignore
            Object.assign(console, window.mcpHelper.originalConsole);
            //@ts-ignore
            const logs = window.mcpHelper.logs;
            //@ts-ignore
            window.mcpHelper = undefined;
            return logs;
          });

          return {
            content: [
              {
                type: 'text',
                text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`,
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
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
