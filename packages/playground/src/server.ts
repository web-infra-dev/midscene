import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DeviceAction,
  ExecutionDump,
  ExecutionTask,
  ExecutorContext,
} from '@midscene/core';
import { ReportActionDump, runConnectivityTest } from '@midscene/core';
import type { Agent as PageAgent } from '@midscene/core/agent';
import { getTmpDir } from '@midscene/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import {
  globalModelConfigManager,
  overrideAIConfig,
} from '@midscene/shared/env';
import { generateElementByPoint } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { uuid } from '@midscene/shared/utils';
import express, { type Request, type Response } from 'express';
import { executeAction, formatErrorMessage } from './common';
import { MjpegStreamHandler } from './mjpeg-stream-handler';
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
import { PointerInputError, dispatchPointer } from './pointer-dispatch';
import {
  type PlaygroundRuntimeInfo,
  buildRuntimeInfo,
} from './runtime-metadata';
import type { AgentFactory } from './types';

import 'dotenv/config';

const defaultPort = PLAYGROUND_SERVER_PORT;

/** Default `0.0.0.0`. Override via `MIDSCENE_PLAYGROUND_HOST` (e.g. `127.0.0.1`). */
function resolvePlaygroundListenHost(): string {
  return process.env.MIDSCENE_PLAYGROUND_HOST?.trim() || '0.0.0.0';
}

function serializeAiConfigSignature(aiConfig: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(aiConfig).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
  );
}

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

const debugScreenshot = getDebug('playground:screenshot', { console: true });
const debugMjpeg = getDebug('playground:mjpeg', { console: true });

/**
 * Thrown when a caller supplies an /interact body that fails validation
 * (missing x/y, missing keyName for KeyboardPress, etc.). Distinct from a
 * downstream device failure so the route handler can map this to HTTP 400.
 */
export class InteractParamsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteractParamsValidationError';
  }
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new InteractParamsValidationError(
      `${field} must be a number for this action`,
    );
  }
  return value;
}

function locateFromPoint(
  x: unknown,
  y: unknown,
  fieldX: string,
  fieldY: string,
  description: string,
) {
  return generateElementByPoint(
    [
      Math.round(requireNumber(x, fieldX)),
      Math.round(requireNumber(y, fieldY)),
    ],
    description,
  );
}

type InteractParamBuilder = (
  body: Record<string, unknown>,
  actionType: string,
) => Record<string, unknown>;

type BrowserChromeInteractAction = 'Stop';

type BrowserChromeInterface = {
  stopLoading?: () => Promise<void>;
};

const POINTER_INTERACT_ACTIONS = new Set([
  'Tap',
  'DoubleClick',
  'LongPress',
  'Swipe',
  'DragAndDrop',
  'KeyboardPress',
  'Input',
  'Pinch',
]);

function isPointerInteractActionType(actionType: string): boolean {
  return POINTER_INTERACT_ACTIONS.has(actionType);
}

const buildLocateActionParams: InteractParamBuilder = (body, actionType) => {
  const params: Record<string, unknown> = {
    locate: locateFromPoint(body.x, body.y, 'x', 'y', `manual ${actionType}`),
  };
  if (typeof body.duration === 'number') {
    params.duration = body.duration;
  }
  return params;
};

const buildSwipeParams: InteractParamBuilder = (body) => {
  const params: Record<string, unknown> = {
    start: locateFromPoint(body.x, body.y, 'x', 'y', 'manual swipe start'),
    end: locateFromPoint(
      body.endX,
      body.endY,
      'endX',
      'endY',
      'manual swipe end',
    ),
  };
  if (typeof body.duration === 'number') params.duration = body.duration;
  if (typeof body.repeat === 'number') params.repeat = body.repeat;
  return params;
};

const buildDragAndDropParams: InteractParamBuilder = (body) => ({
  from: locateFromPoint(body.x, body.y, 'x', 'y', 'manual drag from'),
  to: locateFromPoint(body.endX, body.endY, 'endX', 'endY', 'manual drag to'),
});

const buildKeyboardPressParams: InteractParamBuilder = (body) => {
  if (typeof body.keyName !== 'string') {
    throw new InteractParamsValidationError(
      'keyName is required for KeyboardPress',
    );
  }
  const params: Record<string, unknown> = { keyName: body.keyName };
  if (typeof body.x === 'number' && typeof body.y === 'number') {
    params.locate = locateFromPoint(
      body.x,
      body.y,
      'x',
      'y',
      'manual keyboard press',
    );
  }
  return params;
};

const buildInputParams: InteractParamBuilder = (body) => {
  if (typeof body.value !== 'string') {
    throw new InteractParamsValidationError('value is required for Input');
  }
  const params: Record<string, unknown> = { value: body.value };
  if (typeof body.x === 'number' && typeof body.y === 'number') {
    params.locate = locateFromPoint(body.x, body.y, 'x', 'y', 'manual input');
  }
  if (typeof body.mode === 'string') params.mode = body.mode;
  if (typeof body.autoDismissKeyboard === 'boolean') {
    params.autoDismissKeyboard = body.autoDismissKeyboard;
  }
  return params;
};

function getManualInteractParamBuilder(
  actionType: string,
): InteractParamBuilder | undefined {
  switch (actionType) {
    case 'Tap':
    case 'DoubleClick':
    case 'RightClick':
    case 'Hover':
    case 'LongPress':
      return buildLocateActionParams;
    case 'Swipe':
      return buildSwipeParams;
    case 'DragAndDrop':
      return buildDragAndDropParams;
    case 'KeyboardPress':
      return buildKeyboardPressParams;
    case 'Input':
      return buildInputParams;
    default:
      return undefined;
  }
}

export function buildInteractParams(
  actionType: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const builder = getManualInteractParamBuilder(actionType);
  if (builder) {
    return builder(body, actionType);
  }
  // Fallback: pass-through any caller-provided params for less common actions.
  const { actionType: _omit, ...passthrough } = body as Record<string, unknown>;
  return passthrough;
}

export function createManualExecutorContext(
  actionType: string,
  param: unknown,
): ExecutorContext {
  const task: ExecutionTask = {
    type: 'Action Space',
    subType: actionType,
    param,
    executor: async () => undefined,
    taskId: `manual-${uuid()}`,
    status: 'running',
  };
  return { task };
}
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

const RECOVERABLE_PAGE_SESSION_ERROR_PATTERN =
  /Session closed|page has been closed|target closed|browser has been closed|Target page, context or browser has been closed/i;

function isRecoverablePageSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RECOVERABLE_PAGE_SESSION_ERROR_PATTERN.test(message);
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

  private readonly _mjpegHandler = new MjpegStreamHandler({
    getNativeUrl: () => this._activeConnection.agent?.interface?.mjpegStreamUrl,
    getActiveInterface: () => this._activeConnection.agent?.interface ?? null,
    takeScreenshot: () =>
      this.getActiveAgentOrThrow().interface.screenshotBase64(),
    canTakeScreenshot: () =>
      typeof this._activeConnection.agent?.interface?.screenshotBase64 ===
      'function',
    isAgentReady: () => this._agentReady,
    recoverFromPreviewError: async (error, reason) =>
      (await this.recoverActiveAgentAfterPreviewError(error, reason))
        ?.interface ?? null,
  });

  private sessionManager?: PlaygroundSessionManager;
  private sessionSetupState: 'required' | 'ready' | 'blocked' = 'ready';
  private sessionSetupBlockingReason?: string;

  // Track current running task
  private currentTaskId: string | null = null;

  // Flag to pause MJPEG polling during agent recreation or task execution
  private _agentReady = true;

  // Flag to track if AI config has changed and agent needs recreation
  private _configDirty = false;
  private _lastAiConfigSignature: string | null = null;
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

  private setActiveAgent(
    agent: PageAgent | null,
    options: { preserveActiveStream?: boolean } = {},
  ): void {
    this._activeConnection.agent = agent;
    // The MJPEG hub keys its producer by `activeInterface`. A bare
    // recreateAgent swaps to a new agent instance — even when the
    // underlying device/page is identical — so without a reset the next
    // /mjpeg request finds a stale producer keyed to the previous
    // interface object. `reset()` tears down the producer so the next
    // request rebuilds one. The cancel path opts out: it preserves the
    // browser page across recreates and we want the existing CDP
    // screencast subscribers to keep receiving frames without a
    // disconnect.
    if (!options.preserveActiveStream) {
      this._mjpegHandler.reset();
    }
  }

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
      this.setActiveAgent(agent || null);
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
    this._mjpegHandler.reset();
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

  /**
   * Treat a session as connected when either:
   * - we have a live agent, OR
   * - we are mid-recreate (`_agentReady === false`).
   *
   * `recreateAgent` (e.g. via /cancel) nulls `_activeConnection.agent`
   * before the factory swaps in a fresh one. Without this guard the UI
   * sees a brief `connected: false` window and flashes the
   * SessionSetupPanel ("create agent" form) for ~1–2 seconds.
   */
  private isEffectivelyConnected(): boolean {
    const rawConnected = this.sessionManager
      ? Boolean(
          this._activeConnection.session?.connected &&
            this._activeConnection.agent,
        )
      : Boolean(this._activeConnection.agent);
    return rawConnected || !this._agentReady;
  }

  getSessionInfo(): PlaygroundSessionState & {
    setupState: 'required' | 'ready' | 'blocked';
    setupBlockingReason?: string;
  } {
    return {
      connected: this.isEffectivelyConnected(),
      displayName: this._activeConnection.session?.displayName,
      metadata: {
        ...(this._activeConnection.session?.metadata || {}),
      },
      setupState: this.sessionSetupState,
      setupBlockingReason: this.sessionSetupBlockingReason,
    };
  }

  private buildSessionMetadata(): Record<string, unknown> {
    return {
      ...(this._basePreparedMetadata || {}),
      ...(this._activeConnection.session?.metadata || {}),
      sessionConnected: this.isEffectivelyConnected(),
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

  private async destroyCurrentAgent({
    preserveActiveStream = false,
  }: { preserveActiveStream?: boolean } = {}): Promise<void> {
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
      // Forward `preserveActiveStream` so the cancel path doesn't blow
      // away the MJPEG hub on the implicit `setActiveAgent(null)` that
      // happens before `recreateAgent` plugs in the replacement agent.
      this.setActiveAgent(null, { preserveActiveStream });
      // Once the stale agent is gone there is nothing left to recreate.
      this._configDirty = false;
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
      this._mjpegHandler.reset();
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
   * Recreate agent instance (for cancellation).
   *
   * `preserveActiveStream`: skip the MJPEG hub reset so the existing
   * preview stream stays connected across the swap. Safe when the
   * agent factory reuses the same underlying page/browser (Studio Web
   * does this on cancel) — otherwise the producer would point at a
   * dead source.
   */
  private async recreateAgent({
    preserveActiveStream = false,
  }: { preserveActiveStream?: boolean } = {}): Promise<void> {
    this._agentReady = false;
    console.log('Recreating agent to cancel current task...');

    await this.destroyCurrentAgent({ preserveActiveStream });

    // Create new agent instance if factory is available
    if (this._activeConnection.agentFactory) {
      try {
        this.setActiveAgent(await this._activeConnection.agentFactory(), {
          preserveActiveStream,
        });
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

  private async recoverActiveAgentAfterPreviewError(
    error: unknown,
    reason: string,
  ): Promise<PageAgent | null> {
    if (
      !this._activeConnection.agentFactory ||
      !isRecoverablePageSessionError(error)
    ) {
      return null;
    }

    debugMjpeg(`Recovering active agent after ${reason}:`, error);
    try {
      this._mjpegHandler.reset();
      await this.recreateAgent();
      return this._activeConnection.agent;
    } catch (recreateError) {
      debugMjpeg(
        `Failed to recover active agent after ${reason}:`,
        recreateError,
      );
      return null;
    }
  }

  private findInteractAction(
    agent: PageAgent,
    actionType: string,
  ): DeviceAction<unknown> | undefined {
    return (agent.interface.actionSpace() as DeviceAction<unknown>[]).find(
      (entry) => entry.name === actionType,
    );
  }

  private canRunBrowserChromeInteractAction(
    agent: PageAgent,
    actionType: string,
  ): actionType is BrowserChromeInteractAction {
    return (
      actionType === 'Stop' &&
      typeof (agent.interface as BrowserChromeInterface).stopLoading ===
        'function'
    );
  }

  private async runBrowserChromeInteractAction(
    agent: PageAgent,
    actionType: BrowserChromeInteractAction,
  ): Promise<void> {
    switch (actionType) {
      case 'Stop':
        await (agent.interface as BrowserChromeInterface).stopLoading?.();
        return;
    }
  }

  private async runInteractAction(
    agent: PageAgent,
    actionType: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (this.canRunBrowserChromeInteractAction(agent, actionType)) {
      await this.runBrowserChromeInteractAction(agent, actionType);
      return;
    }

    const action = this.findInteractAction(agent, actionType);
    if (!action || typeof action.call !== 'function') {
      throw new Error(
        `Action "${actionType}" is not available on the current device`,
      );
    }

    await action.call(params, createManualExecutorContext(actionType, params));
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
          this.setActiveAgent(await this._activeConnection.agentFactory());
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
          this.setActiveAgent(await this._activeConnection.agentFactory());
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

          // Destroy and recreate agent to cancel the current task,
          // while keeping the live preview stream alive so the user
          // doesn't see a 3–5s blackout / page reload when they hit
          // Stop. Platform factories that reuse the same device or
          // page across recreates (e.g. Studio Web) honor this hint.
          try {
            await this.recreateAgent({ preserveActiveStream: true });
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
        let agent = this.getActiveAgentOrThrow();
        // Check if page has screenshotBase64 method
        if (typeof agent.interface.screenshotBase64 !== 'function') {
          return res.status(500).json({
            error: 'Screenshot method not available on current interface',
          });
        }

        let screenshot: string;
        try {
          screenshot = await agent.interface.screenshotBase64();
        } catch (error) {
          const recoveredAgent = await this.recoverActiveAgentAfterPreviewError(
            error,
            'screenshot capture',
          );
          if (
            !recoveredAgent ||
            typeof recoveredAgent.interface.screenshotBase64 !== 'function'
          ) {
            throw error;
          }
          agent = recoveredAgent;
          screenshot = await agent.interface.screenshotBase64();
        }

        res.json({
          screenshot,
          timestamp: Date.now(),
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const statusCode = errorMessage === 'No active session' ? 409 : 500;
        if (statusCode !== 409) {
          console.error(`Failed to take screenshot: ${errorMessage}`);
        }
        res.status(statusCode).json({
          error: `Failed to take screenshot: ${errorMessage}`,
        });
      }
    });

    // MJPEG streaming endpoint for real-time screen preview. The actual
    // probe / proxy / in-process producer / polling logic lives in
    // MjpegStreamHandler so this route is just HTTP plumbing.
    this._app.get('/mjpeg', async (req: Request, res: Response) => {
      const agent = this._activeConnection.agent;
      if (!agent) {
        return res.status(409).json({ error: 'No active session' });
      }
      await this._mjpegHandler.serve(req, res);
    });

    // Interface info API for getting interface type and description
    this._app.get('/interface-info', async (_req: Request, res: Response) => {
      try {
        const runtimeInfo = this.getRuntimeInfo();
        const agent = this._activeConnection.agent;
        let size: { width: number; height: number } | undefined;
        let navigationState: { isLoading: boolean } | undefined;
        let actionTypes: string[] | undefined;
        if (typeof agent?.interface?.size === 'function') {
          try {
            size = await agent.interface.size();
          } catch (error) {
            debugScreenshot('interface size() failed:', error);
          }
        }
        if (typeof agent?.interface?.navigationState === 'function') {
          try {
            navigationState = await agent.interface.navigationState();
          } catch (error) {
            debugScreenshot('interface navigationState() failed:', error);
          }
        }
        if (typeof agent?.interface?.actionSpace === 'function') {
          try {
            const actions = agent.interface.actionSpace();
            actionTypes = Array.isArray(actions)
              ? actions
                  .map((action) => action?.name)
                  .filter((name): name is string => typeof name === 'string')
              : undefined;
          } catch (error) {
            debugScreenshot('interface actionSpace() failed:', error);
          }
        }

        res.json({
          type: runtimeInfo.interface.type,
          description: runtimeInfo.interface.description,
          ...(size ? { size } : {}),
          ...(navigationState ? { navigationState } : {}),
          ...(actionTypes ? { actionTypes } : {}),
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

    // Direct manipulation API – invokes a named action immediately, bypassing
    // AI planning, the task lock, and dump bookkeeping. Primitive-capable
    // device previews use the typed input surface; browser navigation falls
    // back to explicit actionSpace/browser-chrome actions.
    this._app.post('/interact', async (req: Request, res: Response) => {
      let agent: PageAgent;
      try {
        agent = this.getActiveAgentOrThrow();
      } catch (error) {
        return res.status(409).json({
          error: error instanceof Error ? error.message : 'No active session',
        });
      }

      const { actionType } = req.body ?? {};
      if (typeof actionType !== 'string' || !actionType) {
        return res.status(400).json({
          error: 'actionType is required',
        });
      }

      try {
        const inputPrimitives = agent.interface.inputPrimitives;
        if (inputPrimitives) {
          await dispatchPointer(inputPrimitives, req.body ?? {}, () =>
            agent.interface.size(),
          );
          res.json({});
          return;
        }

        if (
          !this.findInteractAction(agent, actionType) &&
          !this.canRunBrowserChromeInteractAction(agent, actionType)
        ) {
          return res.status(404).json({
            error: isPointerInteractActionType(actionType)
              ? 'Manual control is not supported on this device'
              : `Action "${actionType}" is not available on the current device`,
          });
        }

        const params = buildInteractParams(actionType, req.body ?? {});
        await this.runInteractAction(agent, actionType, params);
        res.json({});
      } catch (error: unknown) {
        if (error instanceof PointerInputError) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        if (error instanceof InteractParamsValidationError) {
          return res.status(400).json({ error: error.message });
        }

        const recoveredAgent = await this.recoverActiveAgentAfterPreviewError(
          error,
          `manual interact action "${actionType}"`,
        );
        if (recoveredAgent) {
          return res.status(409).json({
            error:
              'The page session was closed and has been recreated. Please retry the action.',
          });
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `Failed to run interact action "${actionType}": ${errorMessage}`,
        );
        res.status(500).json({ error: errorMessage });
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

      const nextConfigSignature = serializeAiConfigSignature(aiConfig);
      const configChanged = nextConfigSignature !== this._lastAiConfigSignature;

      try {
        if (configChanged) {
          overrideAIConfig(aiConfig);
          this._lastAiConfigSignature = nextConfigSignature;
          this._configDirty = Boolean(this._activeConnection.agent);
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update AI config: ${errorMessage}`);
        return res.status(500).json({
          error: `Failed to update AI config: ${errorMessage}`,
        });
      }

      if (!configChanged) {
        return res.json({
          status: 'ok',
          message: 'AI config not changed because it is identical to current',
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

      return res.json({
        status: 'ok',
        message: this._configDirty
          ? 'AI config updated. Agent will be recreated on next execution.'
          : 'AI config updated. New sessions will use it immediately.',
      });
    });

    this.app.post(
      '/connectivity-test',
      async (_req: Request, res: Response) => {
        try {
          const result = await runConnectivityTest({
            defaultModelConfig:
              globalModelConfigManager.getModelConfig('default'),
            planningModelConfig:
              globalModelConfigManager.getModelConfig('planning'),
            insightModelConfig:
              globalModelConfigManager.getModelConfig('insight'),
          });
          return res.json(result);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error(`Connectivity test failed: ${errorMessage}`);
          return res.status(500).json({
            error: errorMessage,
          });
        }
      },
    );
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
      this.setActiveAgent(await this._activeConnection.agentFactory());
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
      const listenHost = resolvePlaygroundListenHost();
      this.server = this._app.listen(serverPort, listenHost, () => {
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
    this._mjpegHandler.shutdown();

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
