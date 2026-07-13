import type { WorkflowError } from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import type { NormalizedStepMeta } from '../parser/types';

export interface StepRunResult<TOutputData = unknown> {
  node: string;
  input: unknown;
  meta: NormalizedStepMeta;
  status: 'success' | 'failed';
  continuedAfterError: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: NodeResult<TOutputData>;
  error?: WorkflowError;
}

export interface WorkflowRunResult {
  status: 'success' | 'failed';
  steps: StepRunResult[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface WorkflowEngineOptions {
  nodes?: readonly NodeDefinition<any, any>[];
}
