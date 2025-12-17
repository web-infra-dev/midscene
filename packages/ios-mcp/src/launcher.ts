import type { Agent } from '@midscene/core/agent';
import type { IOSAgent } from '@midscene/ios';
import { createMCPServerLauncher } from '@midscene/shared/mcp';
import { IOSMidsceneTools } from './ios-tools';
import { IOSMCPServer } from './server';

/**
 * Create an MCP server launcher for a specific iOS Agent
 * Similar to playgroundForAgent, but for iOS MCP servers
 *
 * @example
 * ```typescript
 * import { mcpServerForAgent } from '@midscene/ios-mcp';
 * import { agentFromWdaDevice } from '@midscene/ios';
 *
 * const agent = await agentFromWdaDevice();
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
export function mcpServerForAgent(agent: Agent | IOSAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'iOS',
    ToolsManagerClass: IOSMidsceneTools,
    MCPServerClass: IOSMCPServer,
  });
}
