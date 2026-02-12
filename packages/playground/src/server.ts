import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutionDump } from '@midscene/core';
import { GroupedActionDump } from '@midscene/core';
import type { Agent as PageAgent } from '@midscene/core/agent';
import { getTmpDir } from '@midscene/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import {
  globalModelConfigManager,
  overrideAIConfig,
} from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import express, { type Request, type Response } from 'express';
import { executeAction, formatErrorMessage } from './common';

import 'dotenv/config';

const defaultPort = PLAYGROUND_SERVER_PORT;

// Static path for playground files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATIC_PATH = join(__dirname, '..', '..', 'static');

const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  console.error(err);
  const errorMessage =
    err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    error: errorMessage,
  });
};

class PlaygroundServer {
  private _app: express.Application;
  tmpDir: string;
  server?: Server;
  port?: number | null;
  agent: PageAgent;
  staticPath: string;
  taskExecutionDumps: Record<string, ExecutionDump | null>; // Store execution dumps directly
  id: string; // Unique identifier for this server instance

  private _initialized = false;

  // Native MJPEG stream probe: null = not tested, true/false = result
  private _nativeMjpegAvailable: boolean | null = null;

  // Factory function for recreating agent
  private agentFactory?: (() => PageAgent | Promise<PageAgent>) | null;

  // Track current running task
  private currentTaskId: string | null = null;

  constructor(
    agent: PageAgent | (() => PageAgent) | (() => Promise<PageAgent>),
    staticPath = STATIC_PATH,
    id?: string, // Optional override ID
  ) {
    this._app = express();
    this.tmpDir = getTmpDir()!;
    this.staticPath = staticPath;
    this.taskExecutionDumps = {}; // Initialize as empty object
    // Use provided ID, or generate random UUID for each startup
    this.id = id || uuid();

    // Support both instance and factory function modes
    if (typeof agent === 'function') {
      this.agentFactory = agent;
      this.agent = null as any; // Will be initialized in launch()
    } else {
      this.agent = agent;
      this.agentFactory = null;
    }
  }

  /**
   * Get the Express app instance for custom configuration
   *
   * IMPORTANT: Add middleware (like CORS) BEFORE calling launch()
   * The routes are initialized when launch() is called, so middleware
   * added after launch() will not affect the API routes.
   *
   * @example
   * ```typescript
   * import cors from 'cors';
   *
   * const server = new PlaygroundServer(agent);
   *
   * // Add CORS middleware before launch
   * server.app.use(cors({
   *   origin: true,
   *   credentials: true,
   *   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
   * }));
   *
   * await server.launch();
   * ```
   */
  get app(): express.Application {
    return this._app;
  }

  /**
   * Initialize Express app with all routes and middleware
   * Called automatically by launch() if not already initialized
   */
  private initializeApp(): void {
    if (this._initialized) return;

    // Built-in middleware to parse JSON bodies
    this._app.use(express.json({ limit: '50mb' }));

    // Context update middleware (after JSON parsing)
    this._app.use(
      (req: Request, _res: Response, next: express.NextFunction) => {
        const { context } = req.body || {};
        if (
          context &&
          'updateContext' in this.agent.interface &&
          typeof this.agent.interface.updateContext === 'function'
        ) {
          this.agent.interface.updateContext(context);
          console.log('Context updated by PlaygroundServer middleware');
        }
        next();
      },
    );

    // NOTE: CORS middleware should be added externally via server.app.use()
    // before calling server.launch() if needed

    // API routes
    this.setupRoutes();

    // Static file serving (if staticPath is provided)
    this.setupStaticRoutes();

    // Error handler middleware (must be last)
    this._app.use(errorHandler);

    this._initialized = true;
  }

  filePathForUuid(uuid: string) {
    // Validate uuid to prevent path traversal attacks
    // Only allow alphanumeric characters and hyphens
    if (!/^[a-zA-Z0-9-]+$/.test(uuid)) {
      throw new Error('Invalid uuid format');
    }
    const filePath = join(this.tmpDir, `${uuid}.json`);
    // Double-check that resolved path is within tmpDir
    const resolvedPath = resolve(filePath);
    const resolvedTmpDir = resolve(this.tmpDir);
    if (!resolvedPath.startsWith(resolvedTmpDir)) {
      throw new Error('Invalid path');
    }
    return filePath;
  }

  saveContextFile(uuid: string, context: string) {
    const tmpFile = this.filePathForUuid(uuid);
    console.log(`save context file: ${tmpFile}`);
    writeFileSync(tmpFile, context);
    return tmpFile;
  }

  /**
   * Recreate agent instance (for cancellation)
   */
  private async recreateAgent(): Promise<void> {
    if (!this.agentFactory) {
      throw new Error(
        'Cannot recreate agent: factory function not provided. Attempting to destroy existing agent only.',
      );
    }

    console.log('Recreating agent to cancel current task...');

    // Destroy old agent instance
    try {
      if (this.agent && typeof this.agent.destroy === 'function') {
        await this.agent.destroy();
      }
    } catch (error) {
      console.warn('Failed to destroy old agent:', error);
    }

    // Create new agent instance
    try {
      this.agent = await this.agentFactory();
      console.log('Agent recreated successfully');
    } catch (error) {
      console.error('Failed to recreate agent:', error);
      throw error;
    }
  }

  /**
   * Setup all API routes
   */
  private setupRoutes(): void {
    this._app.get('/status', async (req: Request, res: Response) => {
      res.send({
        status: 'ok',
        id: this.id,
      });
    });

    this._app.get('/context/:uuid', async (req: Request, res: Response) => {
      const { uuid } = req.params;
      let contextFile: string;
      try {
        contextFile = this.filePathForUuid(uuid);
      } catch {
        return res.status(400).json({
          error: 'Invalid uuid format',
        });
      }

      if (!existsSync(contextFile)) {
        return res.status(404).json({
          error: 'Context not found',
        });
      }

      const context = readFileSync(contextFile, 'utf8');
      res.json({
        context,
      });
    });

    this._app.get(
      '/task-progress/:requestId',
      async (req: Request, res: Response) => {
        const { requestId } = req.params;
        const executionDump = this.taskExecutionDumps[requestId] || null;

        res.json({
          executionDump,
        });
      },
    );

    this._app.post('/action-space', async (req: Request, res: Response) => {
      try {
        let actionSpace = [];

        actionSpace = this.agent.interface.actionSpace();

        // Process actionSpace to make paramSchema serializable with shape info
        const processedActionSpace = actionSpace.map((action: unknown) => {
          if (action && typeof action === 'object' && 'paramSchema' in action) {
            const typedAction = action as {
              paramSchema?: { shape?: object; [key: string]: unknown };
              [key: string]: unknown;
            };
            if (
              typedAction.paramSchema &&
              typeof typedAction.paramSchema === 'object'
            ) {
              // Extract shape information from Zod schema
              let processedSchema = null;

              try {
                // Extract shape from runtime Zod object
                if (
                  typedAction.paramSchema.shape &&
                  typeof typedAction.paramSchema.shape === 'object'
                ) {
                  processedSchema = {
                    type: 'ZodObject',
                    shape: typedAction.paramSchema.shape,
                  };
                }
              } catch (e) {
                const actionName =
                  'name' in typedAction && typeof typedAction.name === 'string'
                    ? typedAction.name
                    : 'unknown';
                console.warn(
                  'Failed to process paramSchema for action:',
                  actionName,
                  e,
                );
              }

              return {
                ...typedAction,
                paramSchema: processedSchema,
              };
            }
          }
          return action;
        });

        res.json(processedActionSpace);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to get action space:', error);
        res.status(500).json({
          error: errorMessage,
        });
      }
    });

    // -------------------------
    // actions from report file
    this._app.post(
      '/playground-with-context',
      async (req: Request, res: Response) => {
        const context = req.body.context;

        if (!context) {
          return res.status(400).json({
            error: 'context is required',
          });
        }

        const requestId = uuid();
        this.saveContextFile(requestId, context);
        return res.json({
          location: `/playground/${requestId}`,
          uuid: requestId,
        });
      },
    );

    this._app.post('/execute', async (req: Request, res: Response) => {
      const {
        type,
        prompt,
        params,
        requestId,
        deepThink,
        screenshotIncluded,
        domIncluded,
        deviceOptions,
      } = req.body;

      if (!type) {
        return res.status(400).json({
          error: 'type is required',
        });
      }

      // Always recreate agent before execution to ensure latest config is applied
      if (this.agentFactory) {
        console.log('Destroying old agent before execution...');
        try {
          if (this.agent && typeof this.agent.destroy === 'function') {
            await this.agent.destroy();
          }
        } catch (error) {
          console.warn('Failed to destroy old agent:', error);
        }

        console.log('Creating new agent with latest config...');
        try {
          this.agent = await this.agentFactory();
          console.log('Agent created successfully');
        } catch (error) {
          console.error('Failed to create agent:', error);
          return res.status(500).json({
            error: `Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      // Update device options if provided
      if (
        deviceOptions &&
        this.agent.interface &&
        'options' in this.agent.interface
      ) {
        this.agent.interface.options = {
          ...(this.agent.interface.options || {}),
          ...deviceOptions,
        };
      }

      // Check if another task is running
      if (this.currentTaskId) {
        return res.status(409).json({
          error: 'Another task is already running',
          currentTaskId: this.currentTaskId,
        });
      }

      // Lock this task
      if (requestId) {
        this.currentTaskId = requestId;
        this.taskExecutionDumps[requestId] = null;

        // Use onDumpUpdate to receive and store executionDump directly
        this.agent.onDumpUpdate = (
          _dump: string,
          executionDump?: ExecutionDump,
        ) => {
          if (executionDump) {
            // Store the execution dump directly without transformation
            this.taskExecutionDumps[requestId] = executionDump;
          }
        };
      }

      const response: {
        result: unknown;
        dump: ExecutionDump | null;
        error: string | null;
        reportHTML: string | null;
        requestId?: string;
      } = {
        result: null,
        dump: null,
        error: null,
        reportHTML: null,
        requestId,
      };

      const startTime = Date.now();
      try {
        // Get action space to check for dynamic actions
        const actionSpace = this.agent.interface.actionSpace();

        // Prepare value object for executeAction
        const value = {
          type,
          prompt,
          params,
        };

        response.result = await executeAction(
          this.agent,
          type,
          actionSpace,
          value,
          {
            deepThink,
            screenshotIncluded,
            domIncluded,
            deviceOptions,
          },
        );
      } catch (error: unknown) {
        response.error = formatErrorMessage(error);
      }

      try {
        const dumpString = this.agent.dumpDataString({
          inlineScreenshots: true,
        });
        if (dumpString) {
          const groupedDump =
            GroupedActionDump.fromSerializedString(dumpString);
          // Extract first execution from grouped dump, matching local execution adapter behavior
          response.dump = groupedDump.executions?.[0] || null;
        } else {
          response.dump = null;
        }
        response.reportHTML =
          this.agent.reportHTMLString({ inlineScreenshots: true }) || null;

        this.agent.writeOutActionDumps();
        this.agent.resetDump();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `write out dump failed: requestId: ${requestId}, ${errorMessage}`,
        );
      }

      res.send(response);
      const timeCost = Date.now() - startTime;

      if (response.error) {
        console.error(
          `handle request failed after ${timeCost}ms: requestId: ${requestId}, ${response.error}`,
        );
      } else {
        console.log(
          `handle request done after ${timeCost}ms: requestId: ${requestId}`,
        );
      }

      // Clean up task execution dumps and unlock after execution completes
      if (requestId) {
        delete this.taskExecutionDumps[requestId];
        // Release the lock
        if (this.currentTaskId === requestId) {
          this.currentTaskId = null;
        }
      }
    });

    this._app.post(
      '/cancel/:requestId',
      async (req: Request, res: Response) => {
        const { requestId } = req.params;

        if (!requestId) {
          return res.status(400).json({
            error: 'requestId is required',
          });
        }

        try {
          // Check if this is the current running task
          if (this.currentTaskId !== requestId) {
            return res.json({
              status: 'not_found',
              message: 'Task not found or already completed',
            });
          }

          console.log(`Cancelling task: ${requestId}`);

          // Get current execution data before cancelling (dump and reportHTML)
          let dump: any = null;
          let reportHTML: string | null = null;

          try {
            const dumpString = this.agent.dumpDataString?.({
              inlineScreenshots: true,
            });
            if (dumpString) {
              const groupedDump =
                GroupedActionDump.fromSerializedString(dumpString);
              // Extract first execution from grouped dump
              dump = groupedDump.executions?.[0] || null;
            }

            reportHTML =
              this.agent.reportHTMLString?.({ inlineScreenshots: true }) ||
              null;
          } catch (error: unknown) {
            console.warn('Failed to get execution data before cancel:', error);
          }

          // Recreate/destroy agent to cancel the current task
          await this.recreateAgent();

          // Clean up
          delete this.taskExecutionDumps[requestId];
          this.currentTaskId = null;

          res.json({
            status: 'cancelled',
            message: 'Task cancelled successfully',
            dump,
            reportHTML,
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to cancel: ${errorMessage}`);
          res.status(500).json({
            error: `Failed to cancel: ${errorMessage}`,
          });
        }
      },
    );

    // Screenshot API for real-time screenshot polling
    this._app.get('/screenshot', async (_req: Request, res: Response) => {
      try {
        // Check if page has screenshotBase64 method
        if (typeof this.agent.interface.screenshotBase64 !== 'function') {
          return res.status(500).json({
            error: 'Screenshot method not available on current interface',
          });
        }

        const base64Screenshot = await this.agent.interface.screenshotBase64();

        res.json({
          screenshot: base64Screenshot,
          timestamp: Date.now(),
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to take screenshot: ${errorMessage}`);
        res.status(500).json({
          error: `Failed to take screenshot: ${errorMessage}`,
        });
      }
    });

    // MJPEG streaming endpoint for real-time screen preview
    // Proxies native MJPEG stream (e.g. WDA MJPEG server) when available,
    // falls back to polling screenshotBase64() otherwise.
    this._app.get('/mjpeg', async (req: Request, res: Response) => {
      const iface = this.agent?.interface as any;

      // Try native MJPEG stream first (e.g. WDA's built-in MJPEG server)
      // Only probe once; cache the result to avoid repeated connection failures.
      const nativeUrl: string | undefined = iface?.mjpegStreamUrl;
      if (nativeUrl && this._nativeMjpegAvailable !== false) {
        const proxyOk = await new Promise<boolean>((resolve) => {
          console.log(`MJPEG: trying native stream from ${nativeUrl}`);
          const proxyReq = http.get(nativeUrl, (proxyRes) => {
            this._nativeMjpegAvailable = true;
            console.log('MJPEG: streaming via native WDA MJPEG server');
            const contentType = proxyRes.headers['content-type'];
            if (contentType) {
              res.setHeader('Content-Type', contentType);
            }
            res.setHeader(
              'Cache-Control',
              'no-cache, no-store, must-revalidate',
            );
            res.setHeader('Connection', 'keep-alive');
            proxyRes.pipe(res);
            req.on('close', () => proxyReq.destroy());
            resolve(true);
          });
          proxyReq.on('error', (err) => {
            this._nativeMjpegAvailable = false;
            console.warn(
              `MJPEG: native stream unavailable (${err.message}), using polling mode`,
            );
            resolve(false);
          });
        });
        if (proxyOk) return;
      }

      // Fallback: poll screenshotBase64()
      if (typeof iface?.screenshotBase64 !== 'function') {
        return res.status(500).json({
          error: 'Screenshot method not available on current interface',
        });
      }

      const fps = Math.min(Math.max(Number(req.query.fps) || 10, 1), 30);
      const interval = Math.round(1000 / fps);
      const boundary = 'mjpeg-boundary';
      console.log(`MJPEG: streaming via polling mode (${fps}fps)`);

      res.setHeader(
        'Content-Type',
        `multipart/x-mixed-replace; boundary=${boundary}`,
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Connection', 'keep-alive');

      let stopped = false;
      let consecutiveErrors = 0;
      req.on('close', () => {
        stopped = true;
      });

      while (!stopped) {
        const frameStart = Date.now();
        try {
          const base64 = await this.agent.interface.screenshotBase64();
          if (stopped) break;
          consecutiveErrors = 0;

          // Strip data URL prefix if present
          const raw = base64.replace(/^data:image\/\w+;base64,/, '');
          const buf = Buffer.from(raw, 'base64');

          res.write(`--${boundary}\r\n`);
          res.write('Content-Type: image/jpeg\r\n');
          res.write(`Content-Length: ${buf.length}\r\n\r\n`);
          res.write(buf);
          res.write('\r\n');
        } catch (err) {
          if (stopped) break;
          consecutiveErrors++;
          if (consecutiveErrors <= 3) {
            console.error('MJPEG frame error:', err);
          } else if (consecutiveErrors === 4) {
            console.error(
              'MJPEG: suppressing further errors, retrying silently...',
            );
          }
          // Backoff: wait longer on consecutive failures (max 3s)
          const backoff = Math.min(1000 * consecutiveErrors, 3000);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        // Only sleep if the frame was faster than the target interval
        const elapsed = Date.now() - frameStart;
        const remaining = interval - elapsed;
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining));
        }
      }
    });

    // Interface info API for getting interface type and description
    this._app.get('/interface-info', async (_req: Request, res: Response) => {
      try {
        const type = this.agent.interface.interfaceType || 'Unknown';
        const description = this.agent.interface.describe?.() || undefined;

        res.json({
          type,
          description,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to get interface info: ${errorMessage}`);
        res.status(500).json({
          error: `Failed to get interface info: ${errorMessage}`,
        });
      }
    });

    this.app.post('/config', async (req: Request, res: Response) => {
      const { aiConfig } = req.body;

      if (!aiConfig || typeof aiConfig !== 'object') {
        return res.status(400).json({
          error: 'aiConfig is required and must be an object',
        });
      }

      if (Object.keys(aiConfig).length === 0) {
        return res.json({
          status: 'ok',
          message: 'AI config not changed due to empty object',
        });
      }

      try {
        overrideAIConfig(aiConfig);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update AI config: ${errorMessage}`);
        return res.status(500).json({
          error: `Failed to update AI config: ${errorMessage}`,
        });
      }

      // Validate the config immediately so the frontend gets early feedback
      try {
        globalModelConfigManager.getModelConfig('default');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`AI config validation failed: ${errorMessage}`);
        return res.status(400).json({
          error: errorMessage,
        });
      }

      // Note: Agent will be recreated on next execution to apply new config
      return res.json({
        status: 'ok',
        message:
          'AI config updated. Agent will be recreated on next execution.',
      });
    });
  }

  /**
   * Setup static file serving routes
   */
  private setupStaticRoutes(): void {
    // Handle index.html with port injection
    this._app.get('/', (_req: Request, res: Response) => {
      this.serveHtmlWithPorts(res);
    });

    this._app.get('/index.html', (_req: Request, res: Response) => {
      this.serveHtmlWithPorts(res);
    });

    // Use express.static middleware for secure static file serving
    this._app.use(express.static(this.staticPath));

    // Fallback to index.html for SPA routing
    this._app.get('*', (_req: Request, res: Response) => {
      this.serveHtmlWithPorts(res);
    });
  }

  /**
   * Serve HTML with injected port configuration
   */
  private serveHtmlWithPorts(res: Response): void {
    try {
      const htmlPath = join(this.staticPath, 'index.html');
      let html = readFileSync(htmlPath, 'utf8');

      // Get scrcpy server port from global
      const scrcpyPort = (global as any).scrcpyServerPort || this.port! + 1;

      // Inject scrcpy port configuration script into HTML head
      const configScript = `
        <script>
          window.SCRCPY_PORT = ${scrcpyPort};
        </script>
      `;

      // Insert the script before closing </head> tag
      html = html.replace('</head>', `${configScript}</head>`);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error serving HTML with ports:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Launch the server on specified port
   */
  async launch(port?: number): Promise<PlaygroundServer> {
    // If using factory mode, initialize agent
    if (this.agentFactory) {
      console.log('Initializing agent from factory function...');
      this.agent = await this.agentFactory();
      console.log('Agent initialized successfully');
    }

    // Initialize routes now, after any middleware has been added
    this.initializeApp();

    this.port = port || defaultPort;

    return new Promise((resolve) => {
      const serverPort = this.port;
      this.server = this._app.listen(serverPort, () => {
        resolve(this);
      });
    });
  }

  /**
   * Close the server and clean up resources
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        // Clean up the single agent
        try {
          this.agent.destroy();
        } catch (error) {
          console.warn('Failed to destroy agent:', error);
        }
        this.taskExecutionDumps = {};

        // Close the server
        this.server.close((error) => {
          if (error) {
            reject(error);
          } else {
            this.server = undefined;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

export default PlaygroundServer;
export { PlaygroundServer };
