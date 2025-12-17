import type { Agent } from '@midscene/core/agent';
import { createMCPServerLauncher } from '@midscene/shared/mcp';
import type { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { WebMCPServer } from './server';
import { WebMidsceneTools } from './web-tools';

/**
 * Create an MCP server launcher for a specific Agent
 * Similar to playgroundForAgent, but for MCP servers
 *
 * @example
 * ```typescript
 * import { mcpServerForAgent } from '@midscene/web-bridge-mcp';
 * import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
 *
 * const agent = new AgentOverChromeBridge();
 * await agent.connectCurrentTab();
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
export function mcpServerForAgent(agent: Agent | AgentOverChromeBridge) {
  return createMCPServerLauncher({
    agent: agent,
    platformName: 'Web',
    ToolsManagerClass: WebMidsceneTools,
    MCPServerClass: WebMCPServer,
  });
}
