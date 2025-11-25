import { BaseMCPServer } from '@midscene/shared/mcp';
import { WebMidsceneTools } from './web-tools.js';

declare const __VERSION__: string;

/**
 * Web MCP Server class
 * Usage:
 *   const server = new WebMCPServer();
 *   await server.launch();
 */
export class WebMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/mcp',
      version: __VERSION__,
      description:
        'Midscene MCP Server for Web automation (Puppeteer & Bridge mode)',
    });
  }

  protected createToolsManager(): WebMidsceneTools {
    return new WebMidsceneTools();
  }
}
