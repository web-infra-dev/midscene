import { spawn } from 'node:child_process';
import type { Agent, Agent as PageAgent } from '@midscene/core/agent';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import cors from 'cors';
import PlaygroundServer from './server';
import type { AgentFactory } from './types';

export interface LaunchPlaygroundOptions {
  /**
   * Port to start the playground server on
   * @default 5800
   */
  port?: number;

  /**
   * Whether to automatically open the playground in browser
   * @default true
   */
  openBrowser?: boolean;

  /**
   * Custom browser command to open playground
   * @default 'open' on macOS, 'start' on Windows, 'xdg-open' on Linux
   */
  browserCommand?: string;

  /**
   * Whether to show server logs
   * @default true
   */
  verbose?: boolean;

  /**
   * Fixed ID for the playground server instance
   * If provided, the same ID will be used across restarts,
   * allowing chat history to persist
   * @default undefined (generates random UUID)
   */
  id?: string;

  /**
   * Whether to enable CORS (Cross-Origin Resource Sharing)
   * @default false
   */
  enableCors?: boolean;

  /**
   * Custom static assets directory for the playground frontend
   * @default bundled static assets from @midscene/playground
   */
  staticPath?: string;

  /**
   * Hook for configuring the PlaygroundServer before launch
   * Useful for adding custom middleware beyond the built-in CORS option
   */
  configureServer?: (
    server: PlaygroundServer,
  ) => void | Promise<void>;

  /**
   * CORS configuration options
   * @default { origin: '*', credentials: true } when enableCors is true
   */
  corsOptions?: {
    origin?: string | boolean | string[];
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
  };
}

export interface LaunchPlaygroundResult {
  /**
   * The playground server instance
   */
  server: PlaygroundServer;

  /**
   * The server port
   */
  port: number;

  /**
   * The server host
   */
  host: string;

  /**
   * Function to gracefully shutdown the playground
   */
  close: () => Promise<void>;
}

type LaunchableAgentSource = Agent | AgentFactory;

/**
 * Create a playground launcher for a specific agent
 *
 * @example
 * ```typescript
 * import { playgroundForAgent } from '@midscene/playground';
 * import { SampleDevice, Agent } from '@midscene/core';
 *
 * const device = new SampleDevice();
 * const agent = new Agent(device);
 *
 * // Launch playground for the agent
 * const server = await playgroundForAgent(agent).launch();
 *
 * // Launch with CORS enabled
 * const serverWithCors = await playgroundForAgent(agent).launch({
 *   enableCors: true,
 *   corsOptions: {
 *     origin: ['http://localhost:3000', 'http://localhost:8080'],
 *     credentials: true
 *   }
 * });
 *
 * // Later, when you want to shutdown:
 * server.close();
 * ```
 */
function createPlaygroundLauncher(agentOrFactory: LaunchableAgentSource) {
  return {
    /**
     * Launch the playground server with optional configuration
     */
    async launch(
      options: LaunchPlaygroundOptions = {},
    ): Promise<LaunchPlaygroundResult> {
      const {
        port = PLAYGROUND_SERVER_PORT,
        openBrowser = true,
        browserCommand,
        verbose = true,
        id,
        enableCors = false,
        staticPath,
        configureServer,
        corsOptions = { origin: '*', credentials: true },
      } = options;

      if (
        typeof agentOrFactory !== 'function' &&
        !agentOrFactory.interface
      ) {
        throw new Error('Agent must have an interface property');
      }

      if (verbose) {
        console.log('🚀 Starting Midscene Playground...');
        if (typeof agentOrFactory === 'function') {
          console.log('📱 Agent: factory');
        } else {
          console.log(`📱 Agent: ${agentOrFactory.constructor.name}`);
          console.log(
            `🖥️ Page: ${agentOrFactory.interface.constructor.name}`,
          );
        }
        console.log(`🌐 Port: ${port}`);
        if (staticPath) {
          console.log(`📁 Static path: ${staticPath}`);
        }
        if (enableCors) {
          console.log('🔓 CORS enabled');
        }
      }

      const server = new PlaygroundServer(
        agentOrFactory as PageAgent | AgentFactory,
        staticPath,
        id,
      );

      if (enableCors) {
        server.app.use(cors(corsOptions));
      }

      if (configureServer) {
        await configureServer(server);
      }

      const launchedServer = (await server.launch(port)) as PlaygroundServer;

      if (verbose) {
        console.log(`✅ Playground server started on port ${port}`);
      }

      const url = `http://127.0.0.1:${port}`;

      // Open browser if requested
      if (openBrowser) {
        await openInBrowser(url, browserCommand, verbose);
      }

      return {
        server: launchedServer,
        port,
        host: '127.0.0.1',
        close: async () => {
          if (verbose) {
            console.log('🛑 Shutting down Midscene Playground...');
          }

          try {
            await launchedServer.close();
            if (verbose) {
              console.log('✅ Playground shutdown complete');
            }
          } catch (error) {
            if (verbose) {
              console.error('❌ Error during playground shutdown:', error);
            }
            throw error;
          }
        },
      };
    },
  };
}

/**
 * Create a playground launcher from an already initialized agent instance
 */
export function playgroundForAgent(agent: Agent) {
  return createPlaygroundLauncher(agent);
}

/**
 * Create a playground launcher from an agent factory
 * Useful for device-backed agents that need to be recreated after cancellation
 */
export function playgroundForAgentFactory(agentFactory: AgentFactory) {
  return createPlaygroundLauncher(agentFactory);
}

/**
 * Open URL in browser using platform-appropriate command
 */
async function openInBrowser(
  url: string,
  customCommand?: string,
  verbose = true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    if (customCommand) {
      command = customCommand;
      args = [url];
    } else {
      // Detect platform and use appropriate command
      switch (process.platform) {
        case 'darwin':
          command = 'open';
          args = [url];
          break;
        case 'win32':
          command = 'start';
          args = ['', url]; // Empty string for title
          break;
        default:
          command = 'xdg-open';
          args = [url];
          break;
      }
    }

    if (verbose) {
      console.log(`🌐 Opening browser: ${command} ${args.join(' ')}`);
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (error) => {
      if (verbose) {
        console.warn('⚠️  Failed to open browser automatically:', error.message);
        console.log(`🌐 Please open manually: ${url}`);
      }
      // Don't reject, just continue - browser opening is optional
      resolve();
    });

    child.on('close', () => {
      resolve();
    });

    // Don't wait for the browser process
    child.unref();
  });
}
