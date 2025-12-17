import type { AndroidAgent } from '@midscene/android';
import type { Agent } from '@midscene/core/agent';
import { createMCPServerLauncher } from '@midscene/shared/mcp';
import { AndroidMidsceneTools } from './android-tools';
import { AndroidMCPServer } from './server';

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
