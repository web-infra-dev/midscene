import type { WorkflowError } from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import type { NormalizedStep, NormalizedStepMeta } from '../parser/types';

export type Awaitable<T> = T | Promise<T>;

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
  setupError?: WorkflowError;
  teardownErrors?: WorkflowError[];
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

export interface WorkflowAttemptInfo {
  readonly testId: string;
  readonly runId: string;
  readonly name: string;
  readonly sourcePath: string;
  readonly workflowIndex: number;
  readonly steps: readonly NormalizedStep[];
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export interface WorkflowTeardownContext extends WorkflowAttemptInfo {
  readonly completedSteps: readonly StepRunResult[];
  readonly status: 'success' | 'failed';
  readonly setupError?: WorkflowError;
}

export type WorkflowTeardown = (
  ctx: WorkflowTeardownContext,
) => Awaitable<void>;

export interface WorkflowSetupContext extends WorkflowAttemptInfo {
  onTeardown(teardown: WorkflowTeardown): void;
}

export type WorkflowSetup<TContext> = (
  ctx: WorkflowSetupContext,
) => Awaitable<TContext>;

export interface RunWorkflowOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  setupWorkflow?: WorkflowSetup<TContext>;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
  createRunId?(): string;
}

export interface WorkflowEngineOptions<TContext = undefined> {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}
