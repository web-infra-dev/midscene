import { BaseMCPServer } from '@midscene/shared/mcp';
import { PlaywrightMidsceneTools } from './playwright-tools.js';

declare const __VERSION__: string;

/**
 * Playwright MCP Server class
 * Usage:
 *   const server = new PlaywrightMCPServer();
 *   await server.launch();
 */
export class PlaywrightMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/web-playwright-mcp',
      version: __VERSION__,
      description: 'Midscene MCP Server for Web automation (Playwright mode)',
    });
  }

  protected createToolsManager(): PlaywrightMidsceneTools {
    return new PlaywrightMidsceneTools();
  }
}
