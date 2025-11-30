import { BaseMCPServer } from '@midscene/shared/mcp';
import { IOSMidsceneTools } from './ios-tools.js';

declare const __VERSION__: string;

/**
 * iOS MCP Server
 * Provides MCP tools for iOS automation through WebDriverAgent
 */
export class IOSMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/ios-mcp',
      version: __VERSION__,
      description: 'Midscene MCP Server for iOS automation',
    });
  }

  protected createToolsManager(): IOSMidsceneTools {
    return new IOSMidsceneTools();
  }
}
