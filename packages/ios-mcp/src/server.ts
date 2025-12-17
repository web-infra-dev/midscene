import { BaseMCPServer } from '@midscene/shared/mcp';
import { IOSMidsceneTools } from './ios-tools.js';

declare const __VERSION__: string;

/**
 * iOS MCP Server
 * Provides MCP tools for iOS automation through WebDriverAgent
 *
 * Usage:
 *   const server = new IOSMCPServer();
 *   await server.launch();
 *
 *   // Or with an existing tools manager:
 *   const toolsManager = new IOSMidsceneTools();
 *   const server = new IOSMCPServer(toolsManager);
 *   await server.launch();
 */
export class IOSMCPServer extends BaseMCPServer {
  constructor(toolsManager?: IOSMidsceneTools) {
    super(
      {
        name: '@midscene/ios-mcp',
        version: __VERSION__,
        description: 'Midscene MCP Server for iOS automation',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): IOSMidsceneTools {
    return new IOSMidsceneTools();
  }
}
