import type { BaseMCPServer } from './base-server';
import type { HttpLaunchOptions, LaunchMCPServerResult } from './base-server';
import type { IMidsceneTools } from './types';

export interface LaunchMCPServerOptions extends HttpLaunchOptions {
  /**
   * Whether to show server logs
   * @default true
   */
  verbose?: boolean;
}

/**
 * Generic agent type (avoid importing from @midscene/core to prevent circular deps)
 */
export interface GenericAgent {
  interface: any;
  constructor: { name: string };
}

export interface MCPServerLauncherConfig<
  TAgent extends GenericAgent = GenericAgent,
  TToolsManager extends IMidsceneTools = IMidsceneTools,
> {
  agent: TAgent;
  platformName: string;
  ToolsManagerClass: new () => TToolsManager;
  MCPServerClass: new (toolsManager?: TToolsManager) => BaseMCPServer;
}

/**
 * Create a generic MCP server launcher
 * This helper reduces code duplication across platform-specific launchers
 *
 * @internal
 */
export function createMCPServerLauncher<
  TAgent extends GenericAgent,
  TToolsManager extends IMidsceneTools,
>(config: MCPServerLauncherConfig<TAgent, TToolsManager>) {
  const { agent, platformName, ToolsManagerClass, MCPServerClass } = config;

  return {
    /**
     * Launch the MCP server with stdio transport
     */
    async launch(
      options: { verbose?: boolean } = {},
    ): Promise<LaunchMCPServerResult> {
      const { verbose = true } = options;

      // Extract agent components
      const device = agent.interface;
      if (!device) {
        throw new Error('Agent must have an interface property');
      }

      if (verbose) {
        console.log(
          `🚀 Starting Midscene ${platformName} MCP Server (stdio)...`,
        );
        console.log(`📱 Agent: ${agent.constructor.name}`);
        console.log(`🖥️ Device: ${device.constructor.name}`);
      }

      // Create tools manager from the agent
      const toolsManager = new ToolsManagerClass();
      // Set the agent on the tools manager so it doesn't create its own
      (toolsManager as any).agent = agent;

      // Create and launch the server with the provided tools manager
      const server = new MCPServerClass(toolsManager);

      const result = await server.launch();

      if (verbose) {
        console.log(`✅ ${platformName} MCP Server started (stdio mode)`);
      }

      return result;
    },

    /**
     * Launch the MCP server with HTTP transport
     */
    async launchHttp(
      options: LaunchMCPServerOptions,
    ): Promise<LaunchMCPServerResult> {
      const { port, host = 'localhost', verbose = true } = options;

      // Extract agent components
      const device = agent.interface;
      if (!device) {
        throw new Error('Agent must have an interface property');
      }

      if (verbose) {
        console.log(
          `🚀 Starting Midscene ${platformName} MCP Server (HTTP)...`,
        );
        console.log(`📱 Agent: ${agent.constructor.name}`);
        console.log(`🖥️ Device: ${device.constructor.name}`);
        console.log(`🌐 Port: ${port}`);
        console.log(`🏠 Host: ${host}`);
      }

      // Create tools manager from the agent
      const toolsManager = new ToolsManagerClass();
      // Set the agent on the tools manager so it doesn't create its own
      (toolsManager as any).agent = agent;

      // Create and launch the server with the provided tools manager
      const server = new MCPServerClass(toolsManager);

      const result = await server.launchHttp({ port, host });

      if (verbose) {
        console.log(
          `✅ ${platformName} MCP Server started on http://${result.host}:${result.port}/mcp`,
        );
      }

      return result;
    },
  };
}
