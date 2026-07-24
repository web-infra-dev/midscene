import type { z } from 'zod';
import type { ToolDefaults } from './tool-defaults';

// Avoid circular dependency: don't import from @midscene/core
// Instead, use generic types that will be provided by implementation

/**
 * Default timeout constants for app loading verification
 */
export const defaultAppLoadingTimeoutMs = 10000;
export const defaultAppLoadingCheckIntervalMs = 2000;

/**
 * Content item types for tool results.
 */
export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | {
      type: 'resource';
      resource:
        | { text: string; uri: string; mimeType?: string }
        | { uri: string; blob: string; mimeType?: string };
    };

/**
 * Result type for tool execution.
 */
export interface ToolResult {
  [x: string]: unknown;
  content: ToolResultContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * Tool handler function type
 * Takes parsed arguments and returns a tool result
 */
export type ToolHandler<T = Record<string, unknown>> = (
  args: T,
) => Promise<ToolResult>;

/**
 * Tool schema type using Zod
 */
export type ToolSchema = Record<string, z.ZodTypeAny>;

export interface ToolCliOption {
  preferredName?: string;
  aliases?: string[];
}

export interface ToolCliMetadata {
  options?: Record<string, ToolCliOption>;
}

/**
 * Tool definition for Midscene CLI and Skill surfaces.
 */
export interface ToolDefinition<T = Record<string, unknown>> {
  name: string;
  description: string;
  schema: ToolSchema;
  handler: ToolHandler<T>;
  cli?: ToolCliMetadata;
}

export type Tool = ToolDefinition;

/**
 * Action space item definition
 * Note: Intentionally no index signature to maintain compatibility with DeviceAction
 */
export interface ActionSpaceItem {
  name: string;
  description?: string;
  args?: Record<string, unknown>;
  paramSchema?: z.ZodTypeAny;
}

/**
 * Structural shape compatible with @midscene/core `TUserPrompt`.
 * Declared locally to avoid a circular dep on `@midscene/core` from `@midscene/shared`.
 *
 * Currently consumed only by the `assert` tool in `generateCommonTools`.
 * `aiAction` and `aiWaitFor` stay string-only at the CLI surface because the
 * tools generator does not yet expose multimodal entry points for them.
 */
export type UserPromptLike =
  | string
  | {
      prompt: string;
      images?: Array<{ name: string; url: string }>;
      convertHttpImage2Base64?: boolean;
    };

export interface RecordToReportScreenshot {
  /**
   * PNG/JPEG data URI, or raw PNG base64 body.
   */
  base64: string;
  description?: string;
}

export interface RecordToReportOptions {
  content?: string;
  /**
   * @deprecated Use `screenshots: [{ base64 }]` instead.
   */
  screenshotBase64?: string;
  screenshots?: RecordToReportScreenshot[];
}

/** Generic progress-bus envelope as seen by tool consumers (all untrusted). */
export interface BaseAgentProgressEvent {
  scope?: unknown;
  phase?: unknown;
  sequence?: unknown;
  data?: unknown;
}

/**
 * Minimal UI observation lifecycle required by shared tool surfaces.
 * Call {@link stop} before {@link aiAssert} so the assertion receives the
 * complete observation window.
 */
export interface BaseUIObserver {
  /** Stop sampling and finalize the observed frame window. */
  stop(): Promise<void>;
  /** Assert against all frames captured before {@link stop} completed. */
  aiAssert(
    assertion: string,
    msg?: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

/** Options for {@link BaseAgent.startObserving}. */
export interface BaseUIObserverOptions {
  /** Sampling interval in milliseconds. Defaults to 1000; minimum 200. */
  intervalMs?: number;
  /** Maximum number of buffered frames. Defaults to 30; minimum 2. */
  maxFrames?: number;
  /** Auto-stop timeout in milliseconds. Defaults to 300000; 0 disables it. */
  watchdogMs?: number;
}

/**
 * Base agent interface
 * Represents a platform-specific agent (Android, iOS, Web)
 * Note: Return types use `unknown` for compatibility with platform-specific implementations
 */
export interface BaseAgent {
  getActionSpace(): Promise<ActionSpaceItem[]>;
  destroy?(): Promise<void>;
  reportFile?: string | null;
  page?: {
    screenshotBase64(): Promise<string>;
  };
  addDumpUpdateListener?: (
    listener: (dump: string, executionDump?: unknown) => void,
  ) => () => void;
  addProgressListener?: (
    listener: (event: BaseAgentProgressEvent) => void,
  ) => () => void;
  recordToReport?: (
    title?: string,
    opt?: RecordToReportOptions,
  ) => Promise<void>;
  callActionInActionSpace?: (
    actionName: string,
    params?: unknown,
  ) => Promise<unknown>;
  aiAction?: (
    description: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  aiWaitFor?: (
    assertion: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  aiAssert?: (
    assertion: UserPromptLike,
    msg?: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  /** Start a UI observation window and capture its baseline frame. */
  startObserving?: (options?: BaseUIObserverOptions) => Promise<BaseUIObserver>;
}

/**
 * Base device interface for temporary device instances
 */
export interface BaseDevice {
  actionSpace(): ActionSpaceItem[];
  destroy?(): Promise<void>;
}

/**
 * Interface for platform-specific tools manager.
 */
export interface IMidsceneTools {
  initTools(): Promise<void>;
  destroy?(): Promise<void>;
  setToolDefaults?(toolDefaults: ToolDefaults): void;
}
