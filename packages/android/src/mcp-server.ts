import type { Agent } from '@midscene/core/agent';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import { AndroidAgent } from './agent';
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
        description:
          'Midscene Android MCP Server: Control the browser using natural language commands for navigation, clicking, input, hovering, screenshots waitFor, and achieving goals.',
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

/**
 * Create MCP kit for a specific Android Agent
 */
export async function mcpKitForAgent(agent: Agent | AndroidAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new AndroidMidsceneTools();

  // Convert Agent to AndroidAgent if needed
  const androidAgent =
    agent instanceof AndroidAgent ? agent : (agent as AndroidAgent);
  toolsManager.setAgent(androidAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for Android automation',
    tools: toolsManager.getToolDefinitions(),
  };
}
