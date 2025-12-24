import { BaseMCPServer } from '@midscene/shared/mcp';
import { WebMidsceneTools } from './web-tools.js';
import {
  type GenericAgent,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';

declare const __VERSION__: string;

/**
 * Web MCP Server class
 * Usage:
 *   const server = new WebMCPServer();
 *   await server.launch();
 *
 *   // Or with an existing tools manager:
 *   const toolsManager = new WebMidsceneTools();
 *   const server = new WebMCPServer(toolsManager);
 *   await server.launch();
 */
export class WebMCPServer extends BaseMCPServer {
  constructor(toolsManager?: WebMidsceneTools) {
    super(
      {
        name: '@midscene/web-bridge-mcp',
        version: __VERSION__,
        description: 'Midscene MCP Server for Web automation (Bridge mode)',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): WebMidsceneTools {
    return new WebMidsceneTools();
  }
}

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
export function mcpServerForAgent<TAgent extends GenericAgent>(agent: TAgent) {
  return createMCPServerLauncher<TAgent, WebMidsceneTools>({
    agent,
    platformName: 'Web',
    ToolsManagerClass: WebMidsceneTools,
    MCPServerClass: WebMCPServer,
  });
}
