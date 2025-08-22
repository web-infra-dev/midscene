#!/usr/bin/env node
import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MidsceneManager } from './midscene.js';
import { PROMPTS } from './prompts.js';
import { tools } from './tools.js';
import { handleListResources, handleReadResource } from './resources.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema, SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';

declare const __VERSION__: string;

setIsMcp(true);

const server = new McpServer({
  name: '@midscene/mcp',
  version: __VERSION__,
  description:
    'Midscene MCP Server: Control the browser using natural language commands for navigation, clicking, input, hovering, and achieving goals. Also supports screenshots and JavaScript execution.',
});

server.tool(
  tools.midscene_playwright_example.name,
  tools.midscene_playwright_example.description,
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
  server.server.registerCapabilities({
    resources: {},
    logging: {},
  });
  
  // Server capabilities are now properly registered
  
  // Register resource handlers BEFORE connecting
  server.server.setRequestHandler(ListResourcesRequestSchema, handleListResources);
  server.server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);

  // Register logging handler
  server.server.setRequestHandler(SetLevelRequestSchema, async () => {
    // Store level for internal use - don't use console.log in MCP servers
    return {};
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.error('Midscene MCP Server closing, cleaning up browser...');
  server.close();
  midsceneManager.closeBrowser().catch(console.error);
});
