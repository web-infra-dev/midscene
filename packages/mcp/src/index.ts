#!/usr/bin/env node
import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MidsceneManager } from './midscene.js';
import { PROMPTS } from './prompts.js';

declare const __VERSION__: string;

setIsMcp(true);

const server = new McpServer({
  name: '@midscene/mcp',
  version: __VERSION__,
  description:
    'Midscene MCP Server: Control the browser using natural language commands for navigation, clicking, input, hovering, and achieving goals. Also supports screenshots and JavaScript execution.',
});

server.resource(
  'playwright-example',
  'generate-code://playwright-example',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: PROMPTS.PLAYWRIGHT_CODE_EXAMPLE,
      },
    ],
  }),
);
server.resource(
  'midscene-api-docs',
  'generate-code://midscene-api-docs',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: PROMPTS.MIDSCENE_API_DOCS,
      },
    ],
  }),
);

const midsceneManager = new MidsceneManager(server);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Midscene MCP Server closing, cleaning up browser...');
  midsceneManager.closeBrowser().catch(console.error);
  server.close();
});
