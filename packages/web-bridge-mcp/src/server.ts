import { BaseMCPServer } from '@midscene/shared/mcp';
import { WebMidsceneTools } from './web-tools.js';

declare const __VERSION__: string;

/**
 * Web MCP Server class
 * Usage:
 *   const server = new WebMCPServer();
 *   await server.launch();
 *
 *   // Or with an existing tools manager:
 *   const toolsManager = new WebMidsceneTools();
 *   const server = new WebMCPServer(toolsManager);
 *   await server.launch();
 */
export class WebMCPServer extends BaseMCPServer {
  constructor(toolsManager?: WebMidsceneTools) {
    super(
      {
        name: '@midscene/web-bridge-mcp',
        version: __VERSION__,
        description: 'Midscene MCP Server for Web automation (Bridge mode)',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): WebMidsceneTools {
    return new WebMidsceneTools();
  }
}
