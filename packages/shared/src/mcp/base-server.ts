import { randomUUID } from 'node:crypto';
import type { ParseArgsConfig } from 'node:util';
import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Application, Request, Response } from 'express';
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
): Promise<void> {
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

  constructor(config: BaseMCPServerConfig) {
    this.config = config;
    this.mcpServer = new McpServer({
      name: config.name,
      version: config.version,
      description: config.description,
    });
  }

  /**
   * Platform-specific: create tools manager instance
   */
  protected abstract createToolsManager(): IMidsceneTools;

  /**
   * Initialize tools manager and attach to MCP server
   */
  private async initializeToolsManager(): Promise<void> {
    setIsMcp(true);
    this.toolsManager = this.createToolsManager();

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
  public async launch(): Promise<void> {
    await this.initializeToolsManager();

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    process.stdin.on('close', () => this.performCleanup());
  }

  /**
   * Launch MCP server with HTTP transport
   * Supports stateful sessions for web applications and service integration
   */
  public async launchHttp(options: HttpLaunchOptions): Promise<void> {
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

    const express = await import('express');
    const app: Application = express.default();

    // Add JSON body parser with size limit
    app.use(express.default.json({ limit: '10mb' }));

    const sessions = new Map<string, SessionData>();

    app.all('/mcp', async (req: Request, res: Response) => {
      try {
        const rawSessionId = req.headers['mcp-session-id'];
        const sessionId = Array.isArray(rawSessionId)
          ? rawSessionId[0]
          : rawSessionId;
        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session && req.method === 'POST') {
          // Check session limit to prevent DoS
          if (sessions.size >= MAX_SESSIONS) {
            res.status(503).json({
              error: 'Too many active sessions',
              message: 'Server is at maximum capacity. Please try again later.',
            });
            return;
          }
          session = await this.createHttpSession(sessions);
        }

        if (session) {
          session.lastAccessedAt = new Date();
          await session.transport.handleRequest(req, res, req.body);
        } else {
          res
            .status(400)
            .json({ error: 'Invalid session or GET without session' });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('MCP request error:', message);
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
            `ERROR: Port ${options.port} is already in use.\n` +
              `Please try a different port: --port=<number>\n` +
              `Example: --mode=http --port=${options.port + 1}`,
          );
        } else if (error.code === 'EACCES') {
          console.error(
            `ERROR: Permission denied to bind to port ${options.port}.\n` +
              `Ports below 1024 require root/admin privileges.\n` +
              `Please use a port above 1024 or run with elevated privileges.`,
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
        console.log(`Session ${sid} created`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.log(`Session ${transport.sessionId} closed`);
      }
    };

    try {
      await this.mcpServer.connect(transport);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to connect MCP transport: ${message}`);
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
            console.log(`Session ${sid} cleaned up due to inactivity`);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(
              `Failed to close session ${sid} during cleanup: ${message}`,
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
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error closing session during shutdown: ${message}`);
        }
      }
      sessions.clear();

      // Close HTTP server
      try {
        server.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error closing HTTP server: ${message}`);
      }

      this.performCleanup();
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
