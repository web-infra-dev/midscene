#!/usr/bin/env node
import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MidsceneManager } from './midscene.js';
import { PROMPTS } from './prompts.js';

declare const __VERSION__: string;
process.env.IN_MIDSCENE_MCP = 'true';

setIsMcp(true);

const server = new McpServer({
  name: '@midscene/mcp',
  version: __VERSION__,
  description:
    'Midscene MCP Server: Control the browser using natural language commands for navigation, clicking, input, hovering, and achieving goals. Also supports screenshots and JavaScript execution.',
});

server.tool(
  'midscene_playwright_example',
  'Provides Playwright code examples for Midscene. If users need to generate Midscene test cases, they can call this method to get sample Midscene Playwright test cases for generating end-user test cases. Each step must first be verified using the mcp method, and then the final test case is generated based on the playwright example according to the steps executed by mcp',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: PROMPTS.PLAYWRIGHT_CODE_EXAMPLE,
        },
      ],
      isError: false,
    };
  },
);

const midsceneManager = new MidsceneManager(server);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Midscene MCP Server closing, cleaning up browser...');
  server.close();
  midsceneManager.closeBrowser().catch(console.error);
});
