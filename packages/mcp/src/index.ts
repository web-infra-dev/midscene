#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PuppeteerManager } from './puppeteer.js';
import { TOOLS } from './tools.js';

declare const __VERSION__: string;

const server = new Server(
  {
    name: '@midscene/mcp',
    version: __VERSION__,
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const puppeteerManager = new PuppeteerManager(server);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'console://logs',
      mimeType: 'text/plain',
      name: 'Browser console logs',
    },
    ...puppeteerManager.listScreenshotNames().map((name) => ({
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
          text: puppeteerManager.getConsoleLogs(),
        },
      ],
    };
  }

  if (uri.startsWith('screenshot://')) {
    const name = uri.split('://')[1];
    const screenshot = puppeteerManager.getScreenshot(name);
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
  puppeteerManager.handleToolCall(
    request.params.name,
    request.params.arguments ?? {},
  ),
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Puppeteer MCP Server closing, cleaning up browser...');
  puppeteerManager.closeBrowser().catch(console.error);
  server.close();
});
