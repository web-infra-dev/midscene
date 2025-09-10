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

export interface ExecutionOptions {
  deepThink?: boolean;
  screenshotIncluded?: boolean;
  domIncluded?: boolean | 'visible-only';
  context?: any;
  requestId?: string;
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
