import { BaseMCPServer } from '@midscene/shared/mcp';
import { version } from '../package.json';
import { AndroidMidsceneTools } from './android-tools.js';

/**
 * Android MCP Server
 * Provides MCP tools for Android automation through ADB
 */
export class AndroidMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/android-mcp',
      version,
      description: 'Midscene MCP Server for Android automation',
    });
  }

  protected createToolsManager(): AndroidMidsceneTools {
    return new AndroidMidsceneTools();
  }
}
