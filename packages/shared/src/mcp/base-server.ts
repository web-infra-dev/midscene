import { randomUUID } from 'node:crypto';
import type { ParseArgsConfig } from 'node:util';
import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, {
  type Application,
  type Request,
  type Response,
} from 'express';
import type { IMidsceneTools } from './types';

export interface BaseMCPServerConfig {
  name: string;
  version: string;
  description: string;
}

export interface HttpLaunchOptions {
  port: number;
  host?: string;
}

export interface LaunchMCPServerResult {
  /**
   * The MCP server port (for HTTP mode)
   */
  port?: number;

  /**
   * The server host (for HTTP mode)
   */
  host?: string;

  /**
   * Function to gracefully shutdown the MCP server
   */
  close: () => Promise<void>;
}

interface SessionData {
  transport: StreamableHTTPServerTransport;
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * CLI argument configuration for MCP servers
 */
export const CLI_ARGS_CONFIG: ParseArgsConfig['options'] = {
  mode: { type: 'string', default: 'stdio' },
  port: { type: 'string', default: '3000' },
  host: { type: 'string', default: 'localhost' },
};

export interface CLIArgs {
  mode?: string;
  port?: string;
  host?: string;
}

/**
 * Launch an MCP server based on CLI arguments
 * Shared helper to reduce duplication across platform CLI entry points
 */
export function launchMCPServer(
  server: BaseMCPServer,
  args: CLIArgs,
): Promise<LaunchMCPServerResult> {
  if (args.mode === 'http') {
    return server.launchHttp({
      port: Number.parseInt(args.port || '3000', 10),
      host: args.host || 'localhost',
    });
  }
  return server.launch();
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 100; // Maximum concurrent sessions to prevent DoS

/**
 * Base MCP Server class with programmatic launch() API
 * Each platform extends this to provide their own tools manager
 */
export abstract class BaseMCPServer {
  protected mcpServer: McpServer;
  protected toolsManager?: IMidsceneTools;
  protected config: BaseMCPServerConfig;
  protected providedToolsManager?: IMidsceneTools;

  constructor(config: BaseMCPServerConfig, toolsManager?: IMidsceneTools) {
    this.config = config;
    this.mcpServer = new McpServer({
      name: config.name,
      version: config.version,
      description: config.description,
    });
    this.providedToolsManager = toolsManager;
  }

  /**
   * Platform-specific: create tools manager instance
   * This is only called if no tools manager was provided in constructor
   */
  protected abstract createToolsManager(): IMidsceneTools;

  /**
   * Initialize tools manager and attach to MCP server
   */
  private async initializeToolsManager(): Promise<void> {
    setIsMcp(true);

    // Use provided tools manager if available, otherwise create new one
    this.toolsManager = this.providedToolsManager || this.createToolsManager();

    try {
      await this.toolsManager.initTools();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to initialize tools: ${message}`);
      console.error('Tools will be initialized on first use');
    }

    this.toolsManager.attachToServer(this.mcpServer);
  }

  /**
   * Perform cleanup on shutdown
   */
  private performCleanup(): void {
    console.error(`${this.config.name} closing...`);
    this.mcpServer.close();
    this.toolsManager?.closeBrowser?.().catch(console.error);
  }

  /**
   * Initialize and launch the MCP server with stdio transport
   */
  public async launch(): Promise<LaunchMCPServerResult> {
    // Hijack stdout-based console methods to stderr for stdio mode
    // This prevents them from breaking MCP JSON-RPC protocol on stdout
    // Note: console.warn and console.error already output to stderr
    console.log = (...args: unknown[]) => {
      console.error('[LOG]', ...args);
    };
    console.info = (...args: unknown[]) => {
      console.error('[INFO]', ...args);
    };
    console.debug = (...args: unknown[]) => {
      console.error('[DEBUG]', ...args);
    };

    await this.initializeToolsManager();

    const transport = new StdioServerTransport();

    try {
      await this.mcpServer.connect(transport);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to connect MCP stdio transport: ${message}`);
      throw new Error(`Failed to initialize MCP stdio transport: ${message}`);
    }

    // Setup process-level error handlers to prevent crashes
    process.on('uncaughtException', (error: Error) => {
      console.error(`[${this.config.name}] Uncaught Exception:`, error);
      console.error('Stack:', error.stack);
      // Don't exit - try to recover
    });

    process.on('unhandledRejection', (reason: unknown) => {
      console.error(`[${this.config.name}] Unhandled Rejection:`, reason);
      if (reason instanceof Error) {
        console.error('Stack:', reason.stack);
      }
      // Don't exit - try to recover
    });

    // Setup cleanup handlers
    process.stdin.on('close', () => this.performCleanup());

    // Setup signal handlers for graceful shutdown
    const cleanup = () => {
      console.error(`${this.config.name} shutting down...`);
      this.performCleanup();
      process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    return {
      close: async () => {
        this.performCleanup();
      },
    };
  }

  /**
   * Launch MCP server with HTTP transport
   * Supports stateful sessions for web applications and service integration
   */
  public async launchHttp(
    options: HttpLaunchOptions,
  ): Promise<LaunchMCPServerResult> {
    // Validate port number
    if (
      !Number.isInteger(options.port) ||
      options.port < 1 ||
      options.port > 65535
    ) {
      throw new Error(
        `Invalid port number: ${options.port}. Port must be between 1 and 65535.`,
      );
    }

    await this.initializeToolsManager();

    const app: Application = express();

    // Add JSON body parser with size limit
    app.use(express.json({ limit: '10mb' }));

    const sessions = new Map<string, SessionData>();

    app.all('/mcp', async (req: Request, res: Response) => {
      const startTime = Date.now();
      const requestId = randomUUID().substring(0, 8);

      try {
        const rawSessionId = req.headers['mcp-session-id'];
        const sessionId = Array.isArray(rawSessionId)
          ? rawSessionId[0]
          : rawSessionId;
        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session && req.method === 'POST') {
          // Check session limit to prevent DoS
          if (sessions.size >= MAX_SESSIONS) {
            console.error(
              `[${new Date().toISOString()}] [${requestId}] Session limit reached: ${sessions.size}/${MAX_SESSIONS}`,
            );
            res.status(503).json({
              error: 'Too many active sessions',
              message: 'Server is at maximum capacity. Please try again later.',
            });
            return;
          }
          session = await this.createHttpSession(sessions);
          console.log(
            `[${new Date().toISOString()}] [${requestId}] New session created: ${session.transport.sessionId}`,
          );
        }

        if (session) {
          session.lastAccessedAt = new Date();
          await session.transport.handleRequest(req, res, req.body);
          const duration = Date.now() - startTime;
          console.log(
            `[${new Date().toISOString()}] [${requestId}] Request completed in ${duration}ms`,
          );
        } else {
          console.error(
            `[${new Date().toISOString()}] [${requestId}] Invalid session or GET without session`,
          );
          res
            .status(400)
            .json({ error: 'Invalid session or GET without session' });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const duration = Date.now() - startTime;
        console.error(
          `[${new Date().toISOString()}] [${requestId}] MCP request error after ${duration}ms: ${message}`,
        );
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process MCP request',
          });
        }
      }
    });

    const host = options.host || 'localhost';

    // Create server with error handling
    const server = app
      .listen(options.port, host, () => {
        console.log(
          `${this.config.name} HTTP server listening on http://${host}:${options.port}/mcp`,
        );
      })
      .on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(
            `ERROR: Port ${options.port} is already in use.\nPlease try a different port: --port=<number>\nExample: --mode=http --port=${options.port + 1}`,
          );
        } else if (error.code === 'EACCES') {
          console.error(
            `ERROR: Permission denied to bind to port ${options.port}.\nPorts below 1024 require root/admin privileges.\nPlease use a port above 1024 or run with elevated privileges.`,
          );
        } else {
          console.error(
            `ERROR: Failed to start HTTP server on ${host}:${options.port}\n` +
              `Reason: ${error.message}\n` +
              `Code: ${error.code || 'unknown'}`,
          );
        }
        process.exit(1);
      });

    const cleanupInterval = this.startSessionCleanup(sessions);
    this.setupHttpShutdownHandlers(server, sessions, cleanupInterval);

    return {
      port: options.port,
      host,
      close: async () => {
        clearInterval(cleanupInterval);
        for (const session of sessions.values()) {
          try {
            await session.transport.close();
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(
              `Failed to close session ${session.transport.sessionId}: ${message}`,
            );
          }
        }
        sessions.clear();

        return new Promise<void>((resolve) => {
          server.close((err) => {
            if (err) {
              console.error('Error closing HTTP server:', err);
            }
            this.performCleanup();
            resolve();
          });
        });
      },
    };
  }

  /**
   * Create a new HTTP session with transport
   */
  private async createHttpSession(
    sessions: Map<string, SessionData>,
  ): Promise<SessionData> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        sessions.set(sid, {
          transport,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        });
        console.log(
          `[${new Date().toISOString()}] Session ${sid} initialized (total: ${sessions.size})`,
        );
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.log(
          `[${new Date().toISOString()}] Session ${transport.sessionId} closed (remaining: ${sessions.size})`,
        );
      }
    };

    try {
      await this.mcpServer.connect(transport);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${new Date().toISOString()}] Failed to connect MCP transport: ${message}`,
      );
      // Clean up the failed transport
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
      throw new Error(`Failed to initialize MCP session: ${message}`);
    }

    return {
      transport,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
  }

  /**
   * Start periodic session cleanup for inactive sessions
   */
  private startSessionCleanup(
    sessions: Map<string, SessionData>,
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      const now = Date.now();
      for (const [sid, session] of sessions) {
        if (now - session.lastAccessedAt.getTime() > SESSION_TIMEOUT_MS) {
          try {
            session.transport.close();
            sessions.delete(sid);
            console.log(
              `[${new Date().toISOString()}] Session ${sid} cleaned up due to inactivity (remaining: ${sessions.size})`,
            );
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(
              `[${new Date().toISOString()}] Failed to close session ${sid} during cleanup: ${message}`,
            );
            // Still delete from map to prevent retry loops
            sessions.delete(sid);
          }
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Setup shutdown handlers for HTTP server
   */
  private setupHttpShutdownHandlers(
    server: ReturnType<Application['listen']>,
    sessions: Map<string, SessionData>,
    cleanupInterval: ReturnType<typeof setInterval>,
  ): void {
    const cleanup = () => {
      console.error(`${this.config.name} shutting down...`);
      clearInterval(cleanupInterval);

      // Close all sessions with error handling
      for (const session of sessions.values()) {
        try {
          session.transport.close();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`Error closing session during shutdown: ${message}`);
        }
      }
      sessions.clear();

      // Close HTTP server gracefully
      try {
        server.close(() => {
          // Server closed callback - all connections finished
          this.performCleanup();
          process.exit(0);
        });

        // Set a timeout in case server.close() hangs
        setTimeout(() => {
          console.error('Forcefully shutting down after timeout');
          this.performCleanup();
          process.exit(1);
        }, 5000);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error closing HTTP server: ${message}`);
        this.performCleanup();
        process.exit(1);
      }
    };

    // Use once() to prevent multiple registrations
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  /**
   * Get the underlying MCP server instance
   */
  public getServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the tools manager instance
   */
  public getToolsManager(): IMidsceneTools | undefined {
    return this.toolsManager;
  }
}
