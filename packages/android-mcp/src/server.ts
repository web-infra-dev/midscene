import { BaseMCPServer } from '@midscene/shared/mcp';
import { AndroidMidsceneTools } from './android-tools.js';

declare const __VERSION__: string;

/**
 * Android MCP Server
 * Provides MCP tools for Android automation through ADB
 *
 * Usage:
 *   const server = new AndroidMCPServer();
 *   await server.launch();
 *
 *   // Or with an existing tools manager:
 *   const toolsManager = new AndroidMidsceneTools();
 *   const server = new AndroidMCPServer(toolsManager);
 *   await server.launch();
 */
export class AndroidMCPServer extends BaseMCPServer {
  constructor(toolsManager?: AndroidMidsceneTools) {
    super(
      {
        name: '@midscene/android-mcp',
        version: __VERSION__,
        description: 'Midscene MCP Server for Android automation',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): AndroidMidsceneTools {
    return new AndroidMidsceneTools();
  }
}
