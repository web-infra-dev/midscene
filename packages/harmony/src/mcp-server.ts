import type { Agent } from '@midscene/core/agent';
import {
  BaseMCPServer,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import { HarmonyAgent } from './agent';
import { HarmonyMidsceneTools } from './mcp-tools.js';

declare const __VERSION__: string;

export class HarmonyMCPServer extends BaseMCPServer {
  constructor(toolsManager?: HarmonyMidsceneTools) {
    super(
      {
        name: '@midscene/harmony-mcp',
        version: __VERSION__,
        description:
          'Control the HarmonyOS device using natural language commands',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): HarmonyMidsceneTools {
    return new HarmonyMidsceneTools();
  }
}

export function mcpServerForAgent(agent: Agent | HarmonyAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'HarmonyOS',
    ToolsManagerClass: HarmonyMidsceneTools,
    MCPServerClass: HarmonyMCPServer,
  });
}

export async function mcpKitForAgent(agent: Agent | HarmonyAgent): Promise<{
  description: string;
  tools: Tool[];
}> {
  const toolsManager = new HarmonyMidsceneTools();

  const harmonyAgent =
    agent instanceof HarmonyAgent ? agent : (agent as HarmonyAgent);
  toolsManager.setAgent(harmonyAgent);
  await toolsManager.initTools();

  return {
    description: 'Midscene MCP Kit for HarmonyOS automation',
    tools: toolsManager.getToolDefinitions(),
  };
}
