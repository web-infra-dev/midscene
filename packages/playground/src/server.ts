import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutionDump } from '@midscene/core';
import { ReportActionDump } from '@midscene/core';
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
import type {
  PlaygroundCreatedSession,
  PlaygroundExecutionHooks,
  PlaygroundPreviewDescriptor,
  PlaygroundSessionManager,
  PlaygroundSessionSetup,
  PlaygroundSessionState,
  PlaygroundSessionTarget,
  PlaygroundSidecar,
  PreparedPlaygroundPlatform,
} from './platform';
import {
  type PlaygroundRuntimeInfo,
  buildRuntimeInfo,
} from './runtime-metadata';
import type { AgentFactory } from './types';

import 'dotenv/config';

const defaultPort = PLAYGROUND_SERVER_PORT;

/**
 * Recursively serialize a Zod field into a plain object that preserves
 * the `_def` metadata the client relies on (typeName, innerType, values,
 * defaultValue, description, shape, etc.).
 */
export function serializeZodField(field: any): any {
  if (!field || typeof field !== 'object') return field;

  const def = field._def;
  if (!def || typeof def !== 'object') return field;

  const typeName: string | undefined = def.typeName;

  const result: Record<string, any> = {
    _def: {
      typeName,
    },
  };

  // Preserve description
  if (def.description) {
    result._def.description = def.description;
  }

  // Wrapper types (ZodOptional, ZodDefault, ZodNullable) – recurse into innerType
  if (def.innerType) {
    result._def.innerType = serializeZodField(def.innerType);
  }

  // ZodDefault – preserve defaultValue as a serializable plain value
  if (typeName === 'ZodDefault' && typeof def.defaultValue === 'function') {
    try {
      result._def._serializedDefaultValue = def.defaultValue();
    } catch {
      // ignore
    }
  }

  // ZodEnum – preserve values array
  if (typeName === 'ZodEnum' && Array.isArray(def.values)) {
    result._def.values = def.values;
  }

  // ZodObject – recurse into shape
  if (typeName === 'ZodObject') {
    const rawShape = typeof def.shape === 'function' ? def.shape() : def.shape;
    if (rawShape && typeof rawShape === 'object') {
      const serializedShape: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawShape)) {
        serializedShape[k] = serializeZodField(v);
      }
      result._def.shape = serializedShape;
      result.shape = serializedShape;
    }
  }

  // Copy top-level description for compatibility
  if (field.description) {
    result.description = field.description;
  }

  return result;
}

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

interface PlaygroundRuntimeState {
  platformId?: string;
  title?: string;
  description?: string;
  preview?: PlaygroundPreviewDescriptor;
  metadata?: Record<string, unknown>;
}

interface PlaygroundActiveConnection {
  session: PlaygroundSessionState | null;
  agent: PageAgent | null;
  agentFactory?: AgentFactory | null;
  runtime?: PlaygroundRuntimeState;
  executionHooks?: PlaygroundExecutionHooks;
  sidecars?: PlaygroundSidecar[];
}

class PlaygroundServer {
  private _app: express.Application;
  tmpDir: string;
  server?: Server;
  port?: number | null;
  staticPath: string;
  taskExecutionDumps: Record<string, ExecutionDump | null>; // Store execution dumps directly
  id: string; // Unique identifier for this server instance

  /**
   * Port for scrcpy server (used by Android playground for screen mirroring)
   * When set, this port is injected into the HTML page as window.SCRCPY_PORT
   */
  scrcpyPort?: number;

  private _initialized = false;

  // Native MJPEG stream probe: null = not tested, true/false = result
  private _nativeMjpegAvailable: boolean | null = null;

  private sessionManager?: PlaygroundSessionManager;
  private sessionSetupState: 'required' | 'ready' | 'blocked' = 'ready';
  private sessionSetupBlockingReason?: string;

  // Track current running task
  private currentTaskId: string | null = null;

  // Flag to pause MJPEG polling during agent recreation or task execution
  private _agentReady = true;

  // Flag to track if AI config has changed and agent needs recreation
  private _configDirty = false;
  private _baseRuntimeState?: PlaygroundRuntimeState;
  private _basePreparedMetadata?: Record<string, unknown>;
  private _baseExecutionHooks?: PlaygroundExecutionHooks;
  private _baseSidecars?: PlaygroundSidecar[];
  private _activeConnection: PlaygroundActiveConnection = {
    session: null,
    agent: null,
    agentFactory: null,
    runtime: undefined,
    executionHooks: undefined,
    sidecars: undefined,
  };

  constructor(
    agent?: PageAgent | (() => PageAgent) | (() => Promise<PageAgent>),
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
      this._activeConnection.agentFactory = agent;
    } else {
      this._activeConnection.agent = agent || null;
    }
  }

  get agent(): PageAgent | null {
    return this._activeConnection.agent;
  }

  private assertNoActiveSessionForBaseStateUpdate(methodName: string): void {
    if (this._activeConnection.session) {
      throw new Error(
        `${methodName} cannot update prepared state while a session is active`,
      );
    }
  }

  private buildBaseRuntimeState(): PlaygroundRuntimeState | undefined {
    if (!this._baseRuntimeState) {
      return undefined;
    }

    return {
      ...this._baseRuntimeState,
      metadata: this.buildSessionMetadata(),
    };
  }

  private resetConnectionToBaseState(): void {
    this._activeConnection = {
      session: null,
      agent: this._activeConnection.agent,
      agentFactory: this._activeConnection.agentFactory,
      runtime: this.buildBaseRuntimeState(),
      executionHooks: this._baseExecutionHooks,
      sidecars: this._baseSidecars,
    };
  }

  private syncRuntimeState(): void {
    this._baseRuntimeState = {
      ...(this._baseRuntimeState || {}),
      metadata: this.buildSessionMetadata(),
    };

    if (this._activeConnection.session) {
      this._activeConnection = {
        ...this._activeConnection,
        runtime: this._activeConnection.runtime
          ? {
              ...this._activeConnection.runtime,
              metadata: this.buildSessionMetadata(),
            }
          : this.buildBaseRuntimeState(),
      };
      return;
    }

    this.resetConnectionToBaseState();
  }

  private restoreBaseSessionState(): void {
    this.taskExecutionDumps = {};
    this.currentTaskId = null;
    this.sessionSetupState =
      this.sessionSetupState === 'blocked' ? 'blocked' : 'required';
    this._activeConnection = {
      session: null,
      agent: null,
      agentFactory: null,
      runtime: this.buildBaseRuntimeState(),
      executionHooks: this._baseExecutionHooks,
      sidecars: this._baseSidecars,
    };
    this.syncRuntimeState();
  }

  setPreparedPlatform(
    prepared: Pick<
      PreparedPlaygroundPlatform,
      | 'platformId'
      | 'title'
      | 'description'
      | 'preview'
      | 'metadata'
      | 'sessionManager'
      | 'executionHooks'
      | 'sidecars'
    >,
  ): void {
    // Allow overriding the initial session created by agentFactory in launch()
    if (this._activeConnection.session && this._activeConnection.agentFactory) {
      this._activeConnection.session = null;
    }
    this.assertNoActiveSessionForBaseStateUpdate('setPreparedPlatform');
    this.sessionManager = prepared.sessionManager;
    this._basePreparedMetadata = prepared.metadata
      ? { ...prepared.metadata }
      : undefined;
    this._baseRuntimeState = {
      platformId: prepared.platformId,
      title: prepared.title,
      description: prepared.description,
      preview: prepared.preview,
      metadata: this.buildSessionMetadata(),
    };
    this._baseExecutionHooks = prepared.executionHooks;
    this._baseSidecars = prepared.sidecars;
    this.resetConnectionToBaseState();

    if (
      this.sessionManager &&
      !this._activeConnection.agent &&
      !this._activeConnection.session
    ) {
      this.sessionSetupState =
        this._basePreparedMetadata?.setupState === 'blocked'
          ? 'blocked'
          : 'required';
      this.sessionSetupBlockingReason =
        typeof this._basePreparedMetadata?.setupBlockingReason === 'string'
          ? this._basePreparedMetadata.setupBlockingReason
          : undefined;
    }
  }

  setPreviewDescriptor(preview?: PlaygroundPreviewDescriptor): void {
    this.assertNoActiveSessionForBaseStateUpdate('setPreviewDescriptor');
    this._baseRuntimeState = {
      ...(this._baseRuntimeState || {}),
      preview,
    };
    this.resetConnectionToBaseState();
  }

  setRuntimeMetadata(metadata?: Record<string, unknown>): void {
    this.assertNoActiveSessionForBaseStateUpdate('setRuntimeMetadata');
    this._basePreparedMetadata = metadata ? { ...metadata } : undefined;
    this.syncRuntimeState();
  }

  getRuntimeInfo(): PlaygroundRuntimeInfo {
    return buildRuntimeInfo({
      platformId: this._activeConnection.runtime?.platformId,
      title: this._activeConnection.runtime?.title,
      platformDescription: this._activeConnection.runtime?.description,
      interfaceType:
        this._activeConnection.agent?.interface?.interfaceType || 'Unknown',
      interfaceDescription:
        this._activeConnection.agent?.interface?.describe?.() || undefined,
      preview: this._activeConnection.runtime?.preview,
      metadata: this.buildSessionMetadata(),
      supportsScreenshot:
        typeof this._activeConnection.agent?.interface?.screenshotBase64 ===
        'function',
      mjpegStreamUrl: this._activeConnection.agent?.interface?.mjpegStreamUrl,
      scrcpyPort: this.scrcpyPort,
    });
  }

  getSessionInfo(): PlaygroundSessionState & {
    setupState: 'required' | 'ready' | 'blocked';
    setupBlockingReason?: string;
  } {
    const connected = this.sessionManager
      ? Boolean(
          this._activeConnection.session?.connected &&
            this._activeConnection.agent,
        )
      : Boolean(this._activeConnection.agent);

    return {
      connected,
      displayName: this._activeConnection.session?.displayName,
      metadata: {
        ...(this._activeConnection.session?.metadata || {}),
      },
      setupState: this.sessionSetupState,
      setupBlockingReason: this.sessionSetupBlockingReason,
    };
  }

  private buildSessionMetadata(): Record<string, unknown> {
    const sessionConnected = this.sessionManager
      ? Boolean(
          this._activeConnection.session?.connected &&
            this._activeConnection.agent,
        )
      : Boolean(this._activeConnection.agent);

    return {
      ...(this._basePreparedMetadata || {}),
      ...(this._activeConnection.session?.metadata || {}),
      sessionConnected,
      sessionDisplayName: this._activeConnection.session?.displayName,
      setupState: this.sessionSetupState,
      ...(this.sessionSetupBlockingReason
        ? { setupBlockingReason: this.sessionSetupBlockingReason }
        : {}),
    };
  }

  private async startSidecars(sidecars?: PlaygroundSidecar[]): Promise<void> {
    for (const sidecar of sidecars || []) {
      await sidecar.start();
    }
  }

  private async stopSidecars(sidecars?: PlaygroundSidecar[]): Promise<void> {
    for (const sidecar of sidecars || []) {
      await sidecar.stop?.();
    }
  }

  private getActiveAgentOrThrow(): PageAgent {
    if (!this._activeConnection.agent) {
      throw new Error('No active session');
    }

    return this._activeConnection.agent;
  }

  private async destroyCurrentAgent(): Promise<void> {
    if (!this._activeConnection.agent) {
      return;
    }

    try {
      if (typeof this._activeConnection.agent.destroy === 'function') {
        await this._activeConnection.agent.destroy();
      }
    } catch (error) {
      console.warn('Failed to destroy old agent:', error);
    } finally {
      this._activeConnection.agent = null;
    }
  }

  private async destroyCurrentSession(): Promise<void> {
    const previousSession = this._activeConnection.session;
    const previousSidecars = this._activeConnection.sidecars;
    await this.destroyCurrentAgent();
    await this.stopSidecars(previousSidecars);

    if (this.sessionManager?.destroySession) {
      await this.sessionManager.destroySession(previousSession || undefined);
    }

    this.restoreBaseSessionState();
  }

  private async applyCreatedSession(
    session: PlaygroundCreatedSession,
  ): Promise<void> {
    if (!session.agent && !session.agentFactory) {
      throw new Error(
        'Session creation must provide either an agent or agentFactory',
      );
    }

    const sessionSidecars = session.sidecars || this._baseSidecars;
    await this.startSidecars(sessionSidecars);

    try {
      this._activeConnection = {
        session: {
          connected: true,
          displayName: session.displayName,
          metadata: session.metadata ? { ...session.metadata } : {},
        },
        agent: session.agent || null,
        agentFactory: session.agentFactory || null,
        runtime: {
          platformId: session.platformId ?? this._baseRuntimeState?.platformId,
          title: session.title ?? this._baseRuntimeState?.title,
          description:
            session.platformDescription ?? this._baseRuntimeState?.description,
          preview: session.preview ?? this._baseRuntimeState?.preview,
          metadata: session.metadata ? { ...session.metadata } : {},
        },
        executionHooks: session.executionHooks || this._baseExecutionHooks,
        sidecars: sessionSidecars,
      };
      this.sessionSetupState = 'ready';
      this.sessionSetupBlockingReason = undefined;
      this.syncRuntimeState();
    } catch (error) {
      await this.stopSidecars(sessionSidecars).catch(() => {});
      this.restoreBaseSessionState();
      throw error;
    }
  }

  private async getSessionSetupSchema(
    input?: Record<string, unknown>,
  ): Promise<PlaygroundSessionSetup | null> {
    if (!this.sessionManager) {
      return null;
    }

    return this.sessionManager.getSetupSchema
      ? this.sessionManager.getSetupSchema(input)
      : null;
  }

  private async getSessionTargets(): Promise<PlaygroundSessionTarget[]> {
    if (!this.sessionManager?.listTargets) {
      return [];
    }

    return this.sessionManager.listTargets();
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
          this._activeConnection.agent &&
          context &&
          'updateContext' in this._activeConnection.agent.interface &&
          typeof this._activeConnection.agent.interface.updateContext ===
            'function'
        ) {
          this._activeConnection.agent.interface.updateContext(context);
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
    this._agentReady = false;
    console.log('Recreating agent to cancel current task...');

    await this.destroyCurrentAgent();

    // Create new agent instance if factory is available
    if (this._activeConnection.agentFactory) {
      try {
        this._activeConnection.agent =
          await this._activeConnection.agentFactory();
        this._agentReady = true;
        console.log('Agent recreated successfully');
      } catch (error) {
        this._agentReady = true;
        console.error('Failed to recreate agent:', error);
        throw error;
      }
    } else {
      this._agentReady = true;
      console.warn(
        'Agent destroyed but cannot recreate: no factory function provided. Next /execute call will fail.',
      );
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

    this._app.get('/session', async (_req: Request, res: Response) => {
      res.json(this.getSessionInfo());
    });

    this._app.get('/session/setup', async (req: Request, res: Response) => {
      try {
        const setup = await this.getSessionSetupSchema(
          Object.fromEntries(
            Object.entries(req.query).filter(
              ([, value]) => typeof value === 'string',
            ),
          ),
        );
        if (!setup) {
          return res.status(404).json({
            error: 'Session setup is not available for this playground',
          });
        }

        const targets = await this.getSessionTargets();
        res.json({
          ...setup,
          targets: targets.length > 0 ? targets : setup.targets,
        });
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load session setup',
        });
      }
    });

    this._app.get('/session/targets', async (_req: Request, res: Response) => {
      try {
        res.json(await this.getSessionTargets());
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load session targets',
        });
      }
    });

    this._app.post('/session', async (req: Request, res: Response) => {
      if (!this.sessionManager) {
        return res.status(404).json({
          error: 'Session creation is not available for this playground',
        });
      }

      if (this.currentTaskId) {
        return res.status(409).json({
          error: 'Cannot replace session while a task is running',
        });
      }

      try {
        await this.destroyCurrentSession();
        const created = await this.sessionManager.createSession(req.body || {});
        await this.applyCreatedSession(created);

        if (
          !this._activeConnection.agent &&
          this._activeConnection.agentFactory
        ) {
          this._activeConnection.agent =
            await this._activeConnection.agentFactory();
        }

        if (this._configDirty && this._activeConnection.agentFactory) {
          this._configDirty = false;
          await this.recreateAgent();
        }

        res.json({
          session: this.getSessionInfo(),
          runtimeInfo: this.getRuntimeInfo(),
        });
      } catch (error) {
        const failedSessionSidecars = this._activeConnection.session
          ? this._activeConnection.sidecars
          : undefined;
        await this.destroyCurrentAgent();
        await this.stopSidecars(failedSessionSidecars).catch(() => {});
        this.restoreBaseSessionState();
        res.status(400).json({
          error:
            error instanceof Error ? error.message : 'Failed to create session',
        });
      }
    });

    this._app.delete('/session', async (_req: Request, res: Response) => {
      if (this.currentTaskId) {
        return res.status(409).json({
          error: 'Cannot destroy session while a task is running',
        });
      }

      try {
        await this.destroyCurrentSession();
        res.json({
          session: this.getSessionInfo(),
          runtimeInfo: this.getRuntimeInfo(),
        });
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to destroy session',
        });
      }
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
        const agent = this.getActiveAgentOrThrow();
        let actionSpace = [];

        actionSpace = agent.interface.actionSpace();

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
                  const rawShape = typedAction.paramSchema.shape as Record<
                    string,
                    any
                  >;
                  const serializedShape: Record<string, any> = {};
                  for (const [key, field] of Object.entries(rawShape)) {
                    serializedShape[key] = serializeZodField(field);
                  }
                  processedSchema = {
                    type: 'ZodObject',
                    shape: serializedShape,
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
        res.status(errorMessage === 'No active session' ? 409 : 500).json({
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
      let agent: PageAgent;
      try {
        agent = this.getActiveAgentOrThrow();
      } catch (error) {
        return res.status(409).json({
          error: error instanceof Error ? error.message : 'No active session',
        });
      }

      const {
        type,
        prompt,
        params,
        requestId,
        deepLocate,
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

      // Recreate agent only when AI config has changed (via /config API)
      if (this._activeConnection.agentFactory && this._configDirty) {
        this._configDirty = false;
        this._agentReady = false;
        console.log('AI config changed, recreating agent...');
        try {
          await this.destroyCurrentAgent();
          this._activeConnection.agent =
            await this._activeConnection.agentFactory();
          agent = this.getActiveAgentOrThrow();
          this._agentReady = true;
          console.log('Agent recreated with new config');
        } catch (error) {
          this._agentReady = true;
          console.error('Failed to recreate agent:', error);
          return res.status(500).json({
            error: `Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      // Update device options if provided
      if (deviceOptions) {
        const iface = agent.interface as unknown as {
          options?: Record<string, unknown>;
        };
        iface.options = {
          ...(iface.options || {}),
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
        agent.onDumpUpdate = (_dump: string, executionDump?: ExecutionDump) => {
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
        await this._activeConnection.executionHooks?.beforeExecute?.();

        // Get action space to check for dynamic actions
        const actionSpace = agent.interface.actionSpace();

        // Prepare value object for executeAction
        const value = {
          type,
          prompt,
          params,
        };

        response.result = await executeAction(agent, type, actionSpace, value, {
          deepLocate,
          deepThink,
          screenshotIncluded,
          domIncluded,
          deviceOptions,
        });
      } catch (error: unknown) {
        response.error = formatErrorMessage(error);
      } finally {
        try {
          await this._activeConnection.executionHooks?.afterExecute?.();
        } catch (hookError) {
          console.error('Failed to run execution after hook:', hookError);
        }
      }

      try {
        const dumpString = agent.dumpDataString({
          inlineScreenshots: true,
        });
        if (dumpString) {
          const groupedDump = ReportActionDump.fromSerializedString(dumpString);
          // Extract first execution from grouped dump, matching local execution adapter behavior
          response.dump = groupedDump.executions?.[0] || null;
        } else {
          response.dump = null;
        }
        response.reportHTML =
          agent.reportHTMLString({ inlineScreenshots: true }) || null;

        agent.writeOutActionDumps();
        agent.resetDump();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `write out dump failed: requestId: ${requestId}, ${errorMessage}`,
        );
      } finally {
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
          const agent = this.getActiveAgentOrThrow();
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
            const dumpString = agent.dumpDataString?.({
              inlineScreenshots: true,
            });
            if (dumpString) {
              const groupedDump =
                ReportActionDump.fromSerializedString(dumpString);
              // Extract first execution from grouped dump
              dump = groupedDump.executions?.[0] || null;
            }

            reportHTML =
              agent.reportHTMLString?.({
                inlineScreenshots: true,
              }) || null;
          } catch (error: unknown) {
            console.warn('Failed to get execution data before cancel:', error);
          }

          // Destroy and recreate agent to cancel the current task
          try {
            await this.recreateAgent();
          } catch (error) {
            console.warn('Failed to recreate agent during cancel:', error);
          }

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
          res.status(errorMessage === 'No active session' ? 409 : 500).json({
            error: `Failed to cancel: ${errorMessage}`,
          });
        }
      },
    );

    // Screenshot API for real-time screenshot polling
    this._app.get('/screenshot', async (_req: Request, res: Response) => {
      try {
        const agent = this.getActiveAgentOrThrow();
        // Check if page has screenshotBase64 method
        if (typeof agent.interface.screenshotBase64 !== 'function') {
          return res.status(500).json({
            error: 'Screenshot method not available on current interface',
          });
        }

        const base64Screenshot = await agent.interface.screenshotBase64();

        res.json({
          screenshot: base64Screenshot,
          timestamp: Date.now(),
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to take screenshot: ${errorMessage}`);
        res.status(errorMessage === 'No active session' ? 409 : 500).json({
          error: `Failed to take screenshot: ${errorMessage}`,
        });
      }
    });

    // MJPEG streaming endpoint for real-time screen preview
    // Proxies native MJPEG stream (e.g. WDA MJPEG server) when available,
    // falls back to polling screenshotBase64() otherwise.
    this._app.get('/mjpeg', async (req: Request, res: Response) => {
      const agent = this._activeConnection.agent;
      if (!agent) {
        return res.status(409).json({
          error: 'No active session',
        });
      }

      const nativeUrl = agent.interface?.mjpegStreamUrl;

      if (nativeUrl && this._nativeMjpegAvailable !== false) {
        const proxyOk = await this.probeAndProxyNativeMjpeg(
          nativeUrl,
          req,
          res,
        );
        if (proxyOk) return;
      }

      if (typeof agent.interface?.screenshotBase64 !== 'function') {
        return res.status(500).json({
          error: 'Screenshot method not available on current interface',
        });
      }

      await this.startPollingMjpegStream(req, res);
    });

    // Interface info API for getting interface type and description
    this._app.get('/interface-info', async (_req: Request, res: Response) => {
      try {
        const runtimeInfo = this.getRuntimeInfo();

        res.json({
          type: runtimeInfo.interface.type,
          description: runtimeInfo.interface.description,
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

    this._app.get('/runtime-info', async (_req: Request, res: Response) => {
      try {
        res.json(this.getRuntimeInfo());
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to get runtime info: ${errorMessage}`);
        res.status(500).json({
          error: `Failed to get runtime info: ${errorMessage}`,
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
        this._configDirty = true;
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
   * Probe and proxy a native MJPEG stream (e.g. WDA MJPEG server).
   * Result is cached so we only probe once per server lifetime.
   */
  private probeAndProxyNativeMjpeg(
    nativeUrl: string,
    req: Request,
    res: Response,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      console.log(`MJPEG: trying native stream from ${nativeUrl}`);
      const proxyReq = http.get(nativeUrl, (proxyRes) => {
        this._nativeMjpegAvailable = true;
        console.log('MJPEG: streaming via native WDA MJPEG server');
        const contentType = proxyRes.headers['content-type'];
        if (contentType) {
          res.setHeader('Content-Type', contentType);
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
  }

  /**
   * Stream screenshots as MJPEG by polling screenshotBase64().
   */
  private async startPollingMjpegStream(
    req: Request,
    res: Response,
  ): Promise<void> {
    const defaultMjpegFps = 10;
    const maxMjpegFps = 30;
    const maxErrorBackoffMs = 3000;
    const errorLogThreshold = 3;

    const parsedFps = Number(req.query.fps);
    const fps = Math.min(
      Math.max(Number.isNaN(parsedFps) ? defaultMjpegFps : parsedFps, 1),
      maxMjpegFps,
    );
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
      // Skip frame while agent is being recreated
      if (!this._agentReady) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const frameStart = Date.now();
      try {
        const agent = this.getActiveAgentOrThrow();
        const base64 = await agent.interface.screenshotBase64();
        if (stopped) break;
        consecutiveErrors = 0;

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
        if (consecutiveErrors <= errorLogThreshold) {
          console.error('MJPEG frame error:', err);
        } else if (consecutiveErrors === errorLogThreshold + 1) {
          console.error(
            'MJPEG: suppressing further errors, retrying silently...',
          );
        }
        const backoff = Math.min(1000 * consecutiveErrors, maxErrorBackoffMs);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      const elapsed = Date.now() - frameStart;
      const remaining = interval - elapsed;
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
    }
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

      const scrcpyPort = this.scrcpyPort ?? this.port! + 1;

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
    if (this._activeConnection.agentFactory && !this.sessionManager) {
      console.log('Initializing agent from factory function...');
      this._activeConnection.agent =
        await this._activeConnection.agentFactory();
      this._activeConnection.session = {
        connected: true,
        metadata: {},
      };
      this.sessionSetupState = 'ready';
      this.syncRuntimeState();
      console.log('Agent initialized successfully');
    }

    // Initialize routes now, after any middleware has been added
    this.initializeApp();

    this.port = port || defaultPort;

    return new Promise((resolve) => {
      const serverPort = this.port ?? defaultPort;
      this.server = this._app.listen(serverPort, '0.0.0.0', () => {
        resolve(this);
      });
    });
  }

  /**
   * Close the server and clean up resources
   */
  async close(): Promise<void> {
    await this.destroyCurrentSession().catch((error) => {
      console.warn('Failed to destroy current session during shutdown:', error);
    });

    return new Promise((resolve, reject) => {
      if (this.server) {
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
