import type { Agent } from '@midscene/core/agent';
import { BaseMCPServer, createMCPServerLauncher } from '@midscene/shared/mcp';
import type { AndroidAgent } from './agent';
import { AndroidMidsceneTools } from './mcp-tools.js';

declare const __VERSION__: string;

/**
 * Android MCP Server
 * Provides MCP tools for Android automation through ADB
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

/**
 * Create an MCP server launcher for a specific Android Agent
 */
export function mcpServerForAgent(agent: Agent | AndroidAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'Android',
    ToolsManagerClass: AndroidMidsceneTools,
    MCPServerClass: AndroidMCPServer,
  });
}
