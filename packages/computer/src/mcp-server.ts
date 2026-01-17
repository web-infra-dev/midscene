import type { Agent } from '@midscene/core/agent';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import { ComputerAgent } from './agent';
import { ComputerMidsceneTools } from './mcp-tools.js';

declare const __VERSION__: string;

/**
 * Computer MCP Server
 * Provides MCP tools for computer desktop automation
 */
export class ComputerMCPServer extends BaseMCPServer {
  constructor(toolsManager?: ComputerMidsceneTools) {
    super(
      {
        name: '@midscene/computer-mcp',
        version: __VERSION__,
        description:
          'Control the computer desktop using natural language commands',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): ComputerMidsceneTools {
    return new ComputerMidsceneTools();
  }
}

/**
 * Create an MCP server launcher for a specific Computer Agent
 */
export function mcpServerForAgent(agent: Agent | ComputerAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'Computer',
    ToolsManagerClass: ComputerMidsceneTools,
    MCPServerClass: ComputerMCPServer,
  });
}

/**
 * Create MCP kit for a specific Computer Agent
 */
export async function mcpKitForAgent(agent: Agent | ComputerAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new ComputerMidsceneTools();

  // Convert Agent to ComputerAgent if needed
  const computerAgent =
    agent instanceof ComputerAgent ? agent : (agent as ComputerAgent);
  toolsManager.setAgent(computerAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for computer desktop automation',
    tools: toolsManager.getToolDefinitions(),
  };
}
