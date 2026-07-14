import type { WorkflowError } from '../errors';
import type {
  DocumentNodeDefinition,
  NodeDefinition,
  NodeResult,
} from '../node/types';
import type {
  CollectedWorkflowLifecycle,
  NormalizedStep,
  NormalizedStepMeta,
  NormalizedWorkflowDefinition,
} from '../parser/types';

export type Awaitable<T> = T | Promise<T>;

export type WorkflowNodePhase = 'beforeEach' | 'steps' | 'afterEach';
export type DocumentNodePhase = 'beforeAll' | 'afterAll';
export type NodeExecutionPhase = WorkflowNodePhase | DocumentNodePhase;

export interface StepRunResult<TOutputData = unknown> {
  phase: NodeExecutionPhase;
  stepIndex: number;
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
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface WorkflowDocumentRunResult {
  documentId: string;
  documentRunId: string;
  projectId: string;
  sourcePath: string;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  beforeAll: StepRunResult[];
  afterAll: StepRunResult[];
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
  readonly phase: WorkflowNodePhase;
  readonly stepIndex: number;
  readonly completedNodes: readonly StepRunResult[];
}

export interface NodeDocumentContext {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly sourcePath: string;
  readonly phase: DocumentNodePhase;
  readonly stepIndex: number;
  readonly completedNodes: readonly StepRunResult[];
}

export interface RunWorkflowOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  beforeEach?: readonly NormalizedStep[];
  afterEach?: readonly NormalizedStep[];
  context?: TContext;
  onResult?(result: WorkflowRunResult): Promise<void> | void;
  createRunId?(): string;
}

export interface WorkflowDocumentInfo {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly sourcePath: string;
  readonly workflows: readonly NormalizedWorkflowDefinition[];
  readonly lifecycle: CollectedWorkflowLifecycle;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export interface WorkflowDocumentTeardownContext extends WorkflowDocumentInfo {
  readonly beforeAll: readonly StepRunResult[];
  readonly afterAll: readonly StepRunResult[];
  readonly status: 'success' | 'failed';
  readonly setupError?: WorkflowError;
}

export type WorkflowDocumentTeardown = (
  ctx: WorkflowDocumentTeardownContext,
) => Awaitable<void>;

export interface WorkflowDocumentSetupContext extends WorkflowDocumentInfo {
  onTeardown(teardown: WorkflowDocumentTeardown): void;
}

export type WorkflowDocumentSetup<TContext> = (
  ctx: WorkflowDocumentSetupContext,
) => Awaitable<TContext>;

export interface CreateDocumentRuntimeOptions<TContext = undefined> {
  resolveNode(name: string): DocumentNodeDefinition<any, any, TContext>;
  setupDocument?: WorkflowDocumentSetup<TContext>;
  onResult?(result: WorkflowDocumentRunResult): Promise<void> | void;
  createDocumentRunId?(): string;
}

export interface WorkflowDocumentRuntime<TContext = undefined> {
  readonly context: TContext;
  readonly canRunWorkflows: boolean;
  start(): Promise<WorkflowDocumentRunResult>;
  finish(): Promise<WorkflowDocumentRunResult>;
}

export interface WorkflowEngineOptions<TContext = undefined> {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
  context?: TContext;
}
