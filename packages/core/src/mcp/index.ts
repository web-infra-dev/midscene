import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import {
  BaseMCPServer,
  BaseMidsceneTools,
  type Tool,
  createMCPServerLauncher,
} from '@midscene/shared/mcp';
import type { BaseAgent, BaseDevice, GenericAgent } from '@midscene/shared/mcp';
import { Agent } from '../agent/agent';
import type { AbstractInterface } from '../device';

declare const __VERSION__: string;

type DeviceClass = new (...args: any[]) => AbstractInterface;

/**
 * Generic MidsceneTools for pre-initialized Agent instances.
 * No platform-specific tools (connect/disconnect) — the agent is already ready.
 */
class GenericMidsceneTools extends BaseMidsceneTools<BaseAgent> {
  protected createTemporaryDevice(): BaseDevice {
    // When agent is pre-set via setAgent(), initTools() skips this method.
    // Fallback: return empty actionSpace so initialization doesn't throw.
    return {
      actionSpace: () => [],
    };
  }

  protected async ensureAgent(): Promise<BaseAgent> {
    if (!this.agent) {
      throw new Error(
        'No agent available. When using mcpServerForAgent or mcpKitForAgent, ' +
          'the agent is automatically injected. If you see this error, ' +
          'please report it as a bug.',
      );
    }
    return this.agent;
  }
}

/**
 * Generic MCP Server for any AbstractInterface-based Agent.
 */
class GenericMCPServer extends BaseMCPServer {
  constructor(toolsManager?: GenericMidsceneTools) {
    super(
      {
        name: '@midscene/core-mcp',
        version: __VERSION__,
        description:
          'Control any interface using natural language commands via Midscene',
      },
      toolsManager,
    );
  }

  protected createToolsManager(): GenericMidsceneTools {
    return new GenericMidsceneTools();
  }
}

/**
 * Create an MCP server launcher for a given Agent.
 *
 * @example
 * ```typescript
 * import { Agent } from '@midscene/core/agent';
 * import { mcpServerForAgent } from '@midscene/core/mcp';
 *
 * const device = new SampleDevice();
 * const agent = new Agent(device);
 *
 * // stdio mode
 * await mcpServerForAgent(agent).launch();
 *
 * // HTTP mode
 * await mcpServerForAgent(agent).launchHttp({ port: 3000 });
 * ```
 */
export function mcpServerForAgent(agent: GenericAgent) {
  return createMCPServerLauncher({
    agent,
    platformName: 'Custom',
    ToolsManagerClass: GenericMidsceneTools,
    MCPServerClass: GenericMCPServer,
  });
}

/**
 * Extract MCP tool definitions from a given Agent.
 * Useful for integrating with external MCP servers or LLM tool systems.
 *
 * @example
 * ```typescript
 * import { Agent } from '@midscene/core/agent';
 * import { mcpKitForAgent } from '@midscene/core/mcp';
 *
 * const agent = new Agent(device);
 * const { description, tools } = await mcpKitForAgent(agent);
 * ```
 */
export async function mcpKitForAgent(
  agent: GenericAgent,
): Promise<{ description: string; tools: Tool[] }> {
  const toolsManager = new GenericMidsceneTools();
  toolsManager.setAgent(agent as unknown as BaseAgent);
  await toolsManager.initTools();

  return {
    description:
      'Midscene MCP Kit: Control any interface using natural language commands.',
    tools: toolsManager.getToolDefinitions(),
  };
}

/**
 * Skill tools manager that lazily creates Agent from a Device class.
 * Used by runSkillCLI for CLI / Agent Skills scenarios where no agent exists at startup.
 */
class SkillMidsceneTools extends BaseMidsceneTools<BaseAgent> {
  constructor(private DeviceClass: DeviceClass) {
    super();
  }

  protected createTemporaryDevice(): BaseDevice {
    return new this.DeviceClass() as unknown as BaseDevice;
  }

  protected async ensureAgent(): Promise<BaseAgent> {
    if (!this.agent) {
      const device = new this.DeviceClass();
      this.agent = new Agent(device) as unknown as BaseAgent;
    }
    return this.agent;
  }
}

export interface SkillCLIOptions {
  scriptName: string;
  DeviceClass: DeviceClass;
}

/**
 * Launch a Skill CLI for a custom interface Device class.
 * This enables AI coding assistants (Claude Code, Cline, etc.) to control
 * your custom interface through CLI commands.
 *
 * @example
 * ```typescript
 * #!/usr/bin/env node
 * import { runSkillCLI } from '@midscene/core/mcp';
 * import { SampleDevice } from './sample-device';
 *
 * runSkillCLI({
 *   DeviceClass: SampleDevice,
 *   scriptName: 'my-device',
 * });
 * ```
 */
export function runSkillCLI(options: SkillCLIOptions): Promise<void> {
  const tools = new SkillMidsceneTools(options.DeviceClass);
  return runToolsCLI(tools, options.scriptName).catch((e) => {
    if (!(e instanceof CLIError)) console.error(e);
    process.exit(e instanceof CLIError ? e.exitCode : 1);
  });
}
