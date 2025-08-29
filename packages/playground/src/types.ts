import type { DeviceAction, WebUIContext } from '@midscene/core';

export interface PlaygroundAgent {
  callActionInActionSpace?: (
    actionName: string,
    params: unknown,
  ) => Promise<unknown>;
  aiAssert?: (
    prompt: string,
    locatePrompt?: string,
    options?: Record<string, unknown>,
  ) => Promise<{ pass: boolean; thought: string }>;
  [key: string]:
    | ((prompt: string, options?: Record<string, unknown>) => Promise<unknown>)
    | unknown;
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

export interface ExecutionOptions {
  deepThink?: boolean;
  screenshotIncluded?: boolean;
  domIncluded?: boolean | 'visible-only';
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
