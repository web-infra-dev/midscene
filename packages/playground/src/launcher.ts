import { spawn } from 'node:child_process';
import type { Agent, Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import PlaygroundServer from './server';

export interface LaunchPlaygroundOptions {
  /**
   * Port to start the playground server on
   * @default 3456
   */
  port?: number;

  /**
   * Whether to automatically open the web-playground in browser
   * @default true
   */
  openBrowser?: boolean;

  /**
   * Custom browser command to open web-playground
   * @default 'open' on macOS, 'start' on Windows, 'xdg-open' on Linux
   */
  browserCommand?: string;

  /**
   * Whether to show server logs
   * @default true
   */
  verbose?: boolean;
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
 * // Later, when you want to shutdown:
 * server.close();
 * ```
 */
export function playgroundForAgent(agent: Agent) {
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
      } = options;

      // Extract agent components - Agent has interface property
      const webPage = agent.interface;
      if (!webPage) {
        throw new Error('Agent must have an interface property');
      }

      if (verbose) {
        console.log('🚀 Starting Midscene Playground...');
        console.log(`📱 Agent: ${agent.constructor.name}`);
        console.log(`🖥️ Page: ${webPage.constructor.name}`);
        console.log(`🌐 Port: ${port}`);
      }

      // Create and launch the server with agent instances
      const server = new PlaygroundServer(
        webPage,
        agent as unknown as PageAgent,
      );

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
