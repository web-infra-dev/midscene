export type {
  Awaitable,
  CaseNodePhase,
  DocumentNodePhase,
  NodeExecutionPhase,
  CaseExecutionContext,
  NodeCaseContext,
  NodeDocumentContext,
  StepExecutionInfo,
  StepStartHandler,
  CaseRunStatus,
  ProjectRuntimeOptions,
  ProjectRuntimeResult,
  ProjectRuntime,
} from '@midscene/core/internal/test-runner';

import type * as Core from '@midscene/core/internal/test-runner';
import type { NodeDefinition } from '../node/types';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  NormalizedStep,
  NormalizedStepMeta,
} from '../parser/types';

// Type-only native facade; execution facts and ownership controls stay in core.
export type StepRunResult<TData = unknown> = Omit<
  Core.StepRunResult<TData>,
  'meta'
> & { meta: NormalizedStepMeta };
export type CaseRunResult = Omit<
  Core.CaseRunResult,
  'beforeEach' | 'steps' | 'afterEach' | 'reportSources' | 'reportScopeId'
> & {
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
};
export type WorkflowDocumentRunResult = Omit<
  Core.WorkflowDocumentRunResult,
  'beforeAll' | 'afterAll' | 'reportSources' | 'reportScopeId'
> & {
  beforeAll: StepRunResult[];
  afterAll: StepRunResult[];
};
export type CaseRunOutcome = Omit<
  Core.CaseRunOutcome,
  'onFailure' | 'run' | 'attempts'
> & {
  run?: CaseRunResult;
  attempts?: readonly CaseRunResult[];
};
export type WorkflowDocumentExecutionResult = {
  document: WorkflowDocumentRunResult;
  cases: readonly CaseRunOutcome[];
};
export type StepResultHandler = (
  info: Core.StepExecutionInfo,
  result: StepRunResult,
) => Core.Awaitable<unknown>;
export type NodeScopeTeardownResult = Omit<
  Core.NodeScopeTeardownResult,
  'reportSources'
>;
// biome-ignore lint/suspicious/noConfusingVoidType: teardown callbacks may intentionally return no result.
type NodeScopeTeardownOutput = NodeScopeTeardownResult | void;
export type NodeScopeTeardown = () => Core.Awaitable<NodeScopeTeardownOutput>;
export type RunCollectedCaseOptions<TContext = undefined> = Omit<
  Core.RunCollectedCaseOptions<TContext>,
  | 'reportScopeId'
  | 'resolveNode'
  | 'beforeEach'
  | 'afterEach'
  | 'onStepResult'
  | 'onResult'
> & {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  beforeEach?: readonly NormalizedStep[];
  afterEach?: readonly NormalizedStep[];
  onStepResult?: StepResultHandler;
  onResult?(result: CaseRunResult): Core.Awaitable<unknown>;
};
export type RunWorkflowDocumentOptions<TContext = undefined> = Omit<
  Core.RunWorkflowDocumentOptions<TContext>,
  | 'documentSetup'
  | 'documentAttemptIndex'
  | 'resolveCaseReportScopeId'
  | 'resolveNode'
  | 'onStepResult'
  | 'onCaseStart'
  | 'isFatalError'
  | 'onCaseResult'
  | 'onCaseOutcome'
  | 'onDocumentResult'
  | 'createCaseRunId'
  | 'createDocumentRunId'
> & {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  onStepResult?: StepResultHandler;
  onCaseStart?(collectedCase: CollectedCase): Core.Awaitable<void>;
  isFatalError?(result: CaseRunResult): boolean;
  onCaseResult?(result: CaseRunResult): Core.Awaitable<unknown>;
  onCaseOutcome?(result: CaseRunOutcome): Core.Awaitable<unknown>;
  onDocumentResult?(result: WorkflowDocumentRunResult): Core.Awaitable<unknown>;
  createCaseRunId?(collectedCase: CollectedCase, attemptIndex: number): string;
  createDocumentRunId?(document: CollectedWorkflowDocument): string;
};
export type CreateDocumentRuntimeOptions<TContext = undefined> = Omit<
  Core.CreateDocumentRuntimeOptions<TContext>,
  | 'documentSetup'
  | 'documentAttemptIndex'
  | 'resolveNode'
  | 'onStepResult'
  | 'onResult'
> & {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  onStepResult?: StepResultHandler;
  onResult?(result: WorkflowDocumentRunResult): Core.Awaitable<unknown>;
};
export type WorkflowDocumentRuntime<TContext = undefined> = Omit<
  Core.WorkflowDocumentRuntime<TContext>,
  'signal' | 'start' | 'finish'
> & {
  start(): Promise<WorkflowDocumentRunResult>;
  finish(): Promise<WorkflowDocumentRunResult>;
};
export type CaseRunnerOptions<TContext = undefined> = Omit<
  Core.CaseRunnerOptions<TContext>,
  'nodes'
> & {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
};
