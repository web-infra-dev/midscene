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
  testId: string;
  runId: string;
  name: string;
  sourcePath: string;
  workflowIndex: number;
  status: 'success' | 'failed';
  steps: StepRunResult[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface WorkflowExecutionContext {
  readonly testId: string;
  readonly runId: string;
  readonly name: string;
  readonly sourcePath: string;
  readonly workflowIndex: number;
  readonly completedSteps: readonly StepRunResult[];
}

export interface NodeWorkflowContext extends WorkflowExecutionContext {
  readonly stepIndex: number;
}

export interface RunWorkflowOptions {
  resolveNode(name: string): NodeDefinition<any, any>;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
  createRunId?(): string;
}

export interface WorkflowEngineOptions {
  nodes?: readonly NodeDefinition<any, any>[];
}
