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

export interface PlaygroundConfig {
  type: ExecutionType;
  serverUrl?: string; // For remote-execution protocol
  agent?: PlaygroundAgent; // For local-execution
}

/**
 * Progress message for UI display
 * Generated from ExecutionTask to provide user-friendly progress updates
 */
export interface ProgressMessage {
  id: string; // Unique identifier for this progress message
  taskId: string; // Corresponding task ID from ExecutionTask
  action: string; // Task type display name (e.g., "Plan", "Action", "Query")
  description: string; // Human-readable description of what the task does
  status: 'pending' | 'running' | 'finished' | 'failed'; // Task execution status
  timestamp: number; // Unix timestamp when this message was generated
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
