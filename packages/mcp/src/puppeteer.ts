import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type {
  CallToolResult,
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer, {
  type Browser,
  type Page,
  type LaunchOptions,
} from 'puppeteer';
import {
  consoleLogs,
  notifyConsoleLogsUpdated,
  notifyResourceListChanged,
  screenshots,
} from './resources.js'; // Import state and notification helpers
import { deepMerge } from './utils.js';

// Puppeteer State
let browser: Browser | null = null;
let page: Page | null = null;
let previousLaunchOptions: LaunchOptions | null = null;

interface EnsureBrowserArgs {
  launchOptions?: LaunchOptions;
  allowDangerous?: boolean;
}

// Puppeteer Initialization and Management
export async function ensureBrowser(
  server: Server, // Pass server instance for notifications
  { launchOptions, allowDangerous = false }: EnsureBrowserArgs,
): Promise<Page> {
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
        `Dangerous browser arguments detected: ${dangerousArgs.join(
          ', ',
        )}. Fround from environment variable and tool call argument. Set allowDangerous: true in the tool call arguments to override.`,
      );
    }
  }

  try {
    if (
      (browser && !browser.connected) ||
      (launchOptions &&
        JSON.stringify(launchOptions) !== JSON.stringify(previousLaunchOptions))
    ) {
      await browser?.close();
      browser = null;
      page = null;
    }
  } catch (error) {
    browser = null;
    page = null;
  }

  previousLaunchOptions = launchOptions ?? null;

  if (!browser) {
    const npx_args: LaunchOptions = { headless: false };
    const docker_args: LaunchOptions = {
      headless: true,
      args: ['--no-sandbox', '--single-process', '--no-zygote'],
    };
    browser = await puppeteer.launch(
      deepMerge(
        process.env.DOCKER_CONTAINER ? docker_args : npx_args,
        mergedConfig,
      ),
    );
    const pages = await browser.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      page = await browser.newPage();
    }

    // Setup console listener
    page.on('console', (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logEntry);
      notifyConsoleLogsUpdated(server); // Use notification helper
    });
  }
  if (!page) {
    throw new Error('Failed to initialize Puppeteer page.');
  }
  return page;
}

// Tool Call Handler
declare global {
  interface Window {
    mcpHelper?: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

export async function handleToolCall(
  server: Server, // Pass server instance for notifications
  name: string,
  args: any,
): Promise<CallToolResult> {
  const page = await ensureBrowser(server, args); // Pass server instance

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

      const screenshotResult = await (args.selector
        ? page
            .$(args.selector)
            .then((el) => el?.screenshot({ encoding: 'base64' }))
        : page.screenshot({ encoding: 'base64', fullPage: false }));

      if (!screenshotResult) {
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

      screenshots.set(args.name, screenshotResult);
      notifyResourceListChanged(server); // Use notification helper

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot '${args.name}' taken at ${width}x${height}`,
          } as TextContent,
          {
            type: 'image',
            data: screenshotResult,
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
              text: `Failed to click ${args.selector}: ${
                (error as Error).message
              }`,
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
              text: `Failed to fill ${args.selector}: ${
                (error as Error).message
              }`,
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
              text: `Failed to select ${args.selector}: ${
                (error as Error).message
              }`,
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
              text: `Failed to hover ${args.selector}: ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }

    case 'puppeteer_evaluate':
      try {
        await page.evaluate(() => {
          /* global window */
          // @ts-ignore
          (window as any).mcpHelper = {
            logs: [],
            originalConsole: { ...console },
          };

          (['log', 'info', 'warn', 'error'] as const).forEach((method) => {
            const originalMethod = console[method];
            console[method] = (...evalArgs: any[]) => {
              /* global window */
              // @ts-ignore
              if ((window as any).mcpHelper) {
                // @ts-ignore
                (window as any).mcpHelper.logs.push(
                  `[${method}] ${evalArgs.join(' ')}`,
                );
              }
              originalMethod.apply(console, evalArgs);
            };
          });
        });

        const result = await page.evaluate(args.script);

        const logs = await page.evaluate(() => {
          /* global window */
          // @ts-ignore
          const helper = (window as any).mcpHelper;
          if (helper?.originalConsole) {
            Object.assign(console, helper.originalConsole);
          }
          const collectedLogs = helper?.logs || [];
          /* global window */
          // @ts-ignore
          (window as any).mcpHelper = undefined;
          return collectedLogs;
        });

        return {
          content: [
            {
              type: 'text',
              text: `Execution result:\n${JSON.stringify(
                result,
                null,
                2,
              )}\n\nConsole output:\n${logs.join('\n')}`,
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
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
}

// Cleanup Logic
export async function cleanupPuppeteer() {
  if (browser) {
    try {
      await browser.close();
      console.error('Browser closed.');
    } catch (e) {
      console.error('Error closing browser:', e);
    }
    browser = null; // Ensure state is reset
    page = null;
  }
}

// State Check
export function isBrowserConnected(): boolean {
  return browser?.connected ?? false;
}
