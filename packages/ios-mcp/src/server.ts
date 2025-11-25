import { BaseMCPServer } from '@midscene/shared/mcp';
import { version } from '../package.json';
import { IOSMidsceneTools } from './ios-tools.js';

/**
 * iOS MCP Server
 * Provides MCP tools for iOS automation through WebDriverAgent
 */
export class IOSMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/ios-mcp',
      version,
      description: 'Midscene MCP Server for iOS automation',
    });
  }

  protected createToolsManager(): IOSMidsceneTools {
    return new IOSMidsceneTools();
  }
}
