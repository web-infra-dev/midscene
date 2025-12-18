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
  ToolsManagerClass: new (...args: any[]) => TToolsManager;
  MCPServerClass: new (toolsManager?: TToolsManager) => BaseMCPServer;
}

/**
 * Create a generic MCP server launcher for a given agent, tools manager, and MCP server.
 *
 * This helper centralizes the common wiring logic used by platform-specific launchers:
 * it constructs a tools manager, attaches the provided `agent` to it, then instantiates
 * the `MCPServerClass` and exposes convenience methods to start the server over stdio
 * (`launch`) or HTTP (`launchHttp`).
 *
 * Use this helper when adding a new platform-specific launcher or when you want to
 * avoid duplicating boilerplate code for starting an MCP server. Typically, callers
 * provide:
 * - an `agent` instance that contains the underlying device on its `interface` property
 * - a `ToolsManagerClass` that knows how to expose tools for that agent
 * - an `MCPServerClass` that implements the MCP protocol and supports `launch` and
 *   `launchHttp` methods.
 *
 * The returned object has two methods:
 * - `launch(options?)` to start the server using stdio transport
 * - `launchHttp(options)` to start the server using HTTP transport
 * Both methods accept a `verbose` flag to control console logging.
 *
 * @param config Configuration describing the agent, platform name (for logging),
 *               tools manager implementation, and MCP server implementation.
 *
 * @returns An object with `launch` and `launchHttp` methods to start the MCP server.
 *
 * @example
 * ```typescript
 * import { createMCPServerLauncher } from '@midscene/shared/mcp';
 * import { Agent } from '@midscene/core/agent';
 * import { WebMidsceneTools } from './web-tools';
 * import { WebMCPServer } from './server';
 *
 * const agent = new Agent();
 * const launcher = createMCPServerLauncher({
 *   agent,
 *   platformName: 'Web',
 *   ToolsManagerClass: WebMidsceneTools,
 *   MCPServerClass: WebMCPServer,
 * });
 *
 * // Start with stdio
 * await launcher.launch({ verbose: true });
 *
 * // Or start with HTTP
 * await launcher.launchHttp({ port: 3000, host: 'localhost' });
 * ```
 *
 * @internal
 */
export function createMCPServerLauncher<
  TAgent extends GenericAgent,
  TToolsManager extends IMidsceneTools,
>(config: MCPServerLauncherConfig<TAgent, TToolsManager>) {
  const { agent, platformName, ToolsManagerClass, MCPServerClass } = config;

  /**
   * Validate that the agent has the required interface property
   * @throws {Error} If agent.interface is missing
   */
  function validateAgent(): void {
    const device = agent.interface;
    if (!device) {
      throw new Error(
        `Agent must have an 'interface' property that references the underlying device. Please ensure your agent instance is properly initialized with a device interface. Expected: agent.interface to be defined, but got: ${typeof device}`,
      );
    }
  }

  /**
   * Create and configure a tools manager with the agent
   * @returns Configured tools manager instance
   */
  function createToolsManager(): TToolsManager {
    const toolsManager = new ToolsManagerClass();
    // Type-safe agent injection: cast to unknown first, then to the intersection type
    (toolsManager as unknown as IMidsceneTools & { agent: TAgent }).agent =
      agent;
    return toolsManager;
  }

  /**
   * Log server startup information
   * @param mode - Transport mode ('stdio' or 'HTTP')
   * @param additionalInfo - Additional info to log (e.g., port, host)
   */
  function logStartupInfo(
    mode: 'stdio' | 'HTTP',
    additionalInfo?: { port?: number; host?: string },
  ): void {
    const device = agent.interface;
    console.log(`🚀 Starting Midscene ${platformName} MCP Server (${mode})...`);
    console.log(`📱 Agent: ${agent.constructor.name}`);
    console.log(`🖥️ Device: ${device.constructor.name}`);

    if (additionalInfo?.port !== undefined) {
      console.log(`🌐 Port: ${additionalInfo.port}`);
    }
    if (additionalInfo?.host) {
      console.log(`🏠 Host: ${additionalInfo.host}`);
    }
  }

  return {
    /**
     * Launch the MCP server with stdio transport
     */
    async launch(
      options: { verbose?: boolean } = {},
    ): Promise<LaunchMCPServerResult> {
      const { verbose = true } = options;

      validateAgent();

      if (verbose) {
        logStartupInfo('stdio');
      }

      const toolsManager = createToolsManager();
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

      validateAgent();

      if (verbose) {
        logStartupInfo('HTTP', { port, host });
      }

      const toolsManager = createToolsManager();
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
