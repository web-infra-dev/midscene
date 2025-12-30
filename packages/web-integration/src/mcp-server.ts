import type { GenericAgent } from '@midscene/shared/mcp';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import type { AgentOverChromeBridge } from './bridge-mode';
import { WebMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;

/**
 * Web MCP Server class
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
 */
export function mcpServerForAgent(agent: GenericAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'Web',
    ToolsManagerClass: WebMidsceneTools,
    MCPServerClass: WebMCPServer,
  });
}

/**
 * Create MCP kit for a specific Agent
 */
export async function mcpKitForAgent(agent: GenericAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new WebMidsceneTools();

  // Convert to AgentOverChromeBridge for Web tools manager
  const webAgent = agent as AgentOverChromeBridge;
  toolsManager.setAgent(webAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for Web automation (Bridge mode)',
    tools: toolsManager.getToolDefinitions(),
  };
}
