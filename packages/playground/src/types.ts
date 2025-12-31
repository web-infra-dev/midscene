import type { DeviceAction, WebUIContext } from '@midscene/core';
import type { Agent } from '@midscene/core/agent';

export interface PlaygroundAgent extends Agent {
  [key: string]: any; // Allow dynamic method access for backward compatibility
}

export interface FormValue {
  type: string;
  prompt?: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
}

export interface ServerResponse {
  result?: unknown;
  dump?: any;
  reportHTML?: string;
  error?: string;
}

export interface DeviceOptions {
  imeStrategy?: 'always-yadb' | 'yadb-for-non-ascii';
  autoDismissKeyboard?: boolean;
  keyboardDismissStrategy?: 'esc-first' | 'back-first';
  alwaysRefreshScreenInfo?: boolean;
}

export interface ExecutionOptions {
  deepThink?: boolean;
  screenshotIncluded?: boolean;
  domIncluded?: boolean | 'visible-only';
  planningStrategy?: 'fast' | 'standard';
  context?: any;
  requestId?: string;
  deviceOptions?: DeviceOptions;
}

// Extended web types for playground

export type PlaygroundWebUIContext = WebUIContext & {
  screenshotBase64?: string;
  size: { width: number; height: number; dpr?: number };
};

// SDK types - execution model based
export type ExecutionType = 'local-execution' | 'remote-execution';

// Factory function type for creating agents
export type AgentFactory =
  | (() => PlaygroundAgent)
  | (() => Promise<PlaygroundAgent>);

export interface PlaygroundConfig {
  type: ExecutionType;
  serverUrl?: string; // For remote-execution
  agent?: PlaygroundAgent; // For local-execution: initial agent (optional if agentFactory provided)
  agentFactory?: AgentFactory; // For local-execution: factory for creating/recreating agent
  // Note: For local-execution, at least one of agent or agentFactory must be provided.
  // If only agentFactory is provided, the agent will be created lazily on first use.
}

/**
 * Progress message for UI display
 * Generated from ExecutionTask to provide user-friendly progress updates
 */
export interface ProgressMessage {
  /** Unique identifier for this progress message */
  id: string;
  /** Corresponding task ID from ExecutionTask */
  taskId: string;
  /** Task type display name (e.g., "Plan", "Action", "Query") */
  action: string;
  /** Human-readable description of what the task does */
  description: string;
  /** Task execution status */
  status: 'pending' | 'running' | 'finished' | 'failed';
  /** Unix timestamp when this message was generated */
  timestamp: number;
}

export interface PlaygroundAdapter {
  parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]>;

  formatErrorMessage(error: any): string;

  validateParams(
    value: FormValue,
    action: DeviceAction<unknown> | undefined,
  ): ValidationResult;

  createDisplayContent(
    value: FormValue,
    needsStructuredParams: boolean,
    action: DeviceAction<unknown> | undefined,
  ): string;

  // New server communication methods
  executeAction(
    activeAgent: PlaygroundAgent,
    actionType: string,
    actionSpace: DeviceAction<unknown>[],
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown>;

  getActionSpace?(context: any): Promise<DeviceAction<unknown>[]>;
}
