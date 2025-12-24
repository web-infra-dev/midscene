import { BaseMCPServer } from '@midscene/shared/mcp';
import { AndroidMidsceneTools } from './android-tools.js';
import type { AndroidAgent } from '@midscene/android';
import type { Agent } from '@midscene/core/agent';
import { createMCPServerLauncher } from '@midscene/shared/mcp';

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

/**
 * Create an MCP server launcher for a specific Android Agent
 * Similar to playgroundForAgent, but for Android MCP servers
 *
 * @example
 * ```typescript
 * import { mcpServerForAgent } from '@midscene/android-mcp';
 * import { agentFromAdbDevice } from '@midscene/android';
 *
 * const agent = await agentFromAdbDevice();
 *
 * // Launch HTTP MCP server for the agent
 * const server = await mcpServerForAgent(agent).launchHttp({
 *   port: 3000,
 *   host: 'localhost'
 * });
 *
 * // Or launch stdio MCP server
 * const stdioServer = await mcpServerForAgent(agent).launch();
 *
 * // Later, when you want to shutdown:
 * await server.close();
 * ```
 */
export function mcpServerForAgent(agent: Agent | AndroidAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'Android',
    ToolsManagerClass: AndroidMidsceneTools,
    MCPServerClass: AndroidMCPServer,
  });
}
