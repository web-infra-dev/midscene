import { setIsMcp } from '@midscene/shared/utils';
import type { Application, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
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
   * Initialize and launch the MCP server
   * Can be called programmatically or from CLI
   */
  public async launch(): Promise<void> {
    setIsMcp(true);

    // Create platform-specific tools manager
    this.toolsManager = this.createToolsManager();

    // Try to initialize tools, but don't fail if device/agent is not available
    // Tools will be lazily initialized on first use
    try {
      await this.toolsManager.initTools();
    } catch (error: any) {
      console.error(`Failed to initialize tools: ${error.message}`);
      console.error('Tools will be initialized on first use');
    }

    // Attach to MCP server (even if initTools failed)
    this.toolsManager.attachToServer(this.mcpServer);

    // Connect transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    // Setup cleanup on close
    this.setupCleanup();
  }

  /**
   * Launch MCP server with HTTP transport
   * Supports stateful sessions for web applications and service integration
   */
  public async launchHttp(options: HttpLaunchOptions): Promise<void> {
    setIsMcp(true);

    // Create platform-specific tools manager
    this.toolsManager = this.createToolsManager();

    // Try to initialize tools
    try {
      await this.toolsManager.initTools();
    } catch (error: any) {
      console.error(`Failed to initialize tools: ${error.message}`);
      console.error('Tools will be initialized on first use');
    }

    // Attach to MCP server
    this.toolsManager.attachToServer(this.mcpServer);

    // Setup HTTP server with Express
    const express = await import('express');
    const app: Application = express.default();

    // Parse JSON bodies
    app.use(express.default.json());

    // Session storage
    interface SessionData {
      transport: StreamableHTTPServerTransport;
      createdAt: Date;
      lastAccessedAt: Date;
    }
    const sessions = new Map<string, SessionData>();

    // MCP endpoint handler
    app.all('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;

      let session = sessionId ? sessions.get(sessionId) : null;

      if (!session && req.method === 'POST') {
        // Create new session
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

        // Setup close handler to clean up session
        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
            console.log(`Session ${transport.sessionId} closed`);
          }
        };

        await this.mcpServer.connect(transport);
        session = {
          transport,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        };
      }

      if (session) {
        session.lastAccessedAt = new Date();
        await session.transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({
          error: 'Invalid session or GET without session',
        });
      }
    });

    // Start HTTP server
    const host = options.host || 'localhost';
    const server = app.listen(options.port, host, () => {
      console.log(
        `${this.config.name} HTTP server listening on http://${host}:${options.port}/mcp`,
      );
    });

    // Session cleanup interval (30 minutes timeout)
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000; // 30 minutes

      for (const [sid, session] of sessions.entries()) {
        if (now - session.lastAccessedAt.getTime() > timeout) {
          session.transport.close();
          sessions.delete(sid);
          console.log(`Session ${sid} cleaned up due to inactivity`);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Setup cleanup on shutdown
    const cleanup = () => {
      console.error(`${this.config.name} shutting down...`);
      clearInterval(cleanupInterval);
      for (const [, session] of sessions.entries()) {
        session.transport.close();
      }
      server.close();
      this.mcpServer.close();
      this.toolsManager?.closeBrowser?.().catch(console.error);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanup(): void {
    process.stdin.on('close', () => {
      console.error(`${this.config.name} closing...`);
      this.mcpServer.close();
      this.toolsManager?.closeBrowser?.().catch(console.error);
    });
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
