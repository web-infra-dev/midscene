import type { WorkflowError } from '../errors';
import type {
  DocumentNodeDefinition,
  NodeDefinition,
  NodeResult,
} from '../node/types';
import type {
  CollectedCase,
  CollectedDocumentLifecycle,
  CollectedWorkflowDocument,
  NormalizedCaseDefinition,
  NormalizedStep,
  NormalizedStepMeta,
} from '../parser/types';

export type Awaitable<T> = T | Promise<T>;

export type CaseNodePhase = 'beforeEach' | 'steps' | 'afterEach';
export type DocumentNodePhase = 'beforeAll' | 'afterAll';
export type NodeExecutionPhase = CaseNodePhase | DocumentNodePhase;

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

export interface CaseRunResult {
  caseId: string;
  runId: string;
  name: string;
  sourcePath: string;
  caseIndex: number;
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

export interface CaseExecutionContext {
  readonly caseId: string;
  readonly runId: string;
  readonly name: string;
  readonly sourcePath: string;
  readonly caseIndex: number;
  readonly completedSteps: readonly StepRunResult[];
}

export interface NodeCaseContext extends CaseExecutionContext {
  readonly phase: CaseNodePhase;
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

export interface RunCaseOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  beforeEach?: readonly NormalizedStep[];
  afterEach?: readonly NormalizedStep[];
  context?: TContext;
  onResult?(result: CaseRunResult): Promise<void> | void;
  createRunId?(): string;
}

export type CaseRunStatus = 'success' | 'failed' | 'not-run';

export interface CaseRunOutcome {
  caseId: string;
  name: string;
  sourcePath: string;
  caseIndex: number;
  status: CaseRunStatus;
  run?: CaseRunResult;
  notRunReason?: 'document-start-failed' | 'interrupted';
}

export interface WorkflowDocumentExecutionResult {
  document: WorkflowDocumentRunResult;
  cases: readonly CaseRunOutcome[];
}

export interface RunWorkflowDocumentOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  resolveDocumentNode(name: string): DocumentNodeDefinition<any, any, TContext>;
  setupDocument?: WorkflowDocumentSetup<TContext>;
  shouldStop?(): boolean;
  onCaseResult?(result: CaseRunResult): Promise<void> | void;
  onDocumentResult?(result: WorkflowDocumentRunResult): Promise<void> | void;
  createCaseRunId?(collectedCase: CollectedCase): string;
  createDocumentRunId?(document: CollectedWorkflowDocument): string;
}

export interface WorkflowDocumentInfo {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly sourcePath: string;
  readonly cases: readonly NormalizedCaseDefinition[];
  readonly lifecycle: CollectedDocumentLifecycle;
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
  readonly canRunCases: boolean;
  start(): Promise<WorkflowDocumentRunResult>;
  finish(): Promise<WorkflowDocumentRunResult>;
}

export interface WorkflowEngineOptions<TContext = undefined> {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
  context?: TContext;
}
