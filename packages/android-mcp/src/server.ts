import { BaseMCPServer } from '@midscene/shared/mcp';
import { AndroidMidsceneTools } from './android-tools.js';

declare const __VERSION__: string;

/**
 * Android MCP Server
 * Provides MCP tools for Android automation through ADB
 */
export class AndroidMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/android-mcp',
      version: __VERSION__,
      description: 'Midscene MCP Server for Android automation',
    });
  }

  protected createToolsManager(): AndroidMidsceneTools {
    return new AndroidMidsceneTools();
  }
}
