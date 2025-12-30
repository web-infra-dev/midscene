import type { Agent } from '@midscene/core/agent';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import { IOSAgent } from './agent';
import { IOSMidsceneTools } from './mcp-tools.js';

declare const __VERSION__: string;

/**
 * iOS MCP Server
 * Provides MCP tools for iOS automation through WebDriverAgent
 */
export class IOSMCPServer extends BaseMCPServer {
  constructor(toolsManager?: IOSMidsceneTools) {
    super(
      {
        name: '@midscene/ios-mcp',
        version: __VERSION__,
        description: 'Control the iOS device using natural language commands',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): IOSMidsceneTools {
    return new IOSMidsceneTools();
  }
}

/**
 * Create an MCP server launcher for a specific iOS Agent
 */
export function mcpServerForAgent(agent: Agent | IOSAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'iOS',
    ToolsManagerClass: IOSMidsceneTools,
    MCPServerClass: IOSMCPServer,
  });
}

/**
 * Create MCP kit for a specific iOS Agent
 */
export async function mcpKitForAgent(agent: Agent | IOSAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new IOSMidsceneTools();

  // Convert Agent to IOSAgent if needed
  const iosAgent = agent instanceof IOSAgent ? agent : (agent as IOSAgent);
  toolsManager.setAgent(iosAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for iOS automation',
    tools: toolsManager.getToolDefinitions(),
  };
}
