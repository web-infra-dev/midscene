#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  type ImageContent,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type TextContent,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { TOOLS } from './tools.js';
import { deepMerge } from './utils.js';

// Global state
let browser: Browser | null;
let page: Page | null;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();
let previousLaunchOptions: any = null;

async function ensureBrowser({ launchOptions, allowDangerous }: any) {
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

  // Parse environment config safely
  let envConfig = {};
  try {
    envConfig = JSON.parse(process.env.PUPPETEER_LAUNCH_OPTIONS || '{}');
  } catch (error: any) {
    console.warn(
      'Failed to parse PUPPETEER_LAUNCH_OPTIONS:',
      error?.message || error,
    );
  }

  // Deep merge environment config with user-provided options
  const mergedConfig = deepMerge(envConfig, launchOptions || {});

  // Security validation for merged config
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
        `Dangerous browser arguments detected: ${dangerousArgs.join(', ')}. Fround from environment variable and tool call argument. Set allowDangerous: true in the tool call arguments to override.`,
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
    }
  } catch (error) {
    browser = null;
  }

  previousLaunchOptions = launchOptions;

  if (!browser) {
    const npx_args = { headless: false };
    const docker_args = {
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
    page = pages[0];

    page.on('console', (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logEntry);
      server.notification({
        method: 'notifications/resources/updated',
        params: { uri: 'console://logs' },
      });
    });
  }
  return page!;
}

declare global {
  interface Window {
    mcpHelper?: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

async function handleToolCall(
  name: string,
  args: any,
): Promise<CallToolResult> {
  const page = await ensureBrowser(args);

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

      screenshots.set(args.name, screenshot as string);
      server.notification({
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

const server = new Server(
  {
    name: 'example-servers/puppeteer',
    version: '0.1.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

// Setup request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'console://logs',
      mimeType: 'text/plain',
      name: 'Browser console logs',
    },
    ...Array.from(screenshots.keys()).map((name) => ({
      uri: `screenshot://${name}`,
      mimeType: 'image/png',
      name: `Screenshot: ${name}`,
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri === 'console://logs') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: consoleLogs.join('\n'),
        },
      ],
    };
  }

  if (uri.startsWith('screenshot://')) {
    const name = uri.split('://')[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [
          {
            uri,
            mimeType: 'image/png',
            blob: screenshot,
          },
        ],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {}),
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Puppeteer MCP Server closed');
  server.close();
});
