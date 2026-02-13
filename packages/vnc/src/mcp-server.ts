import type { Agent } from '@midscene/core/agent';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import { VNCAgent } from './agent';
import { VNCMidsceneTools } from './mcp-tools.js';

declare const __VERSION__: string;

/**
 * VNC MCP Server
 * Provides MCP tools for VNC remote desktop automation
 */
export class VNCMCPServer extends BaseMCPServer {
  constructor(toolsManager?: VNCMidsceneTools) {
    super(
      {
        name: '@midscene/vnc-mcp',
        version: __VERSION__,
        description:
          'Control remote VNC desktops using natural language commands',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): VNCMidsceneTools {
    return new VNCMidsceneTools();
  }
}

/**
 * Create an MCP server launcher for a specific VNC Agent
 */
export function mcpServerForAgent(agent: Agent | VNCAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'VNC',
    ToolsManagerClass: VNCMidsceneTools,
    MCPServerClass: VNCMCPServer,
  });
}

/**
 * Create MCP kit for a specific VNC Agent
 */
export async function mcpKitForAgent(agent: Agent | VNCAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new VNCMidsceneTools();

  const vncAgent = agent instanceof VNCAgent ? agent : (agent as VNCAgent);
  toolsManager.setAgent(vncAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for VNC remote desktop automation',
    tools: toolsManager.getToolDefinitions(),
  };
}
