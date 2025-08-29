import type { WebUIContext } from '@midscene/core';

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
