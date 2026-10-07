import type { WorkflowError } from '../errors';
import type {
  NodeDefinition,
  NodeReportTrace,
  NodeResult,
} from '../node/types';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  NormalizedStep,
  NormalizedStepMeta,
} from '../parser/types';
import type {
  DocumentSetupDefinition,
  ProjectSetupDefinition,
  ResolvedExecutionProject,
  WorkflowExecutionProject,
} from '../project';

export type Awaitable<T> = T | Promise<T>;

/** Immutable Agent dump plus its public report entry. Images are relative to dumpPath. */
export interface WorkflowReportSource {
  sourcePath: string;
  dumpPath: string;
}

export interface NodeScopeTeardownResult {
  /** Absolute paths to Midscene reports produced by this execution scope. */
  reportPaths?: readonly string[];
  reportSources?: readonly WorkflowReportSource[];
}

// biome-ignore lint/suspicious/noConfusingVoidType: teardown callbacks may intentionally return no result.
export type NodeScopeTeardown = () => Awaitable<NodeScopeTeardownResult | void>;

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
  report?: { traces: readonly NodeReportTrace[] };
}

export interface CaseRunResult {
  caseId: string;
  runId: string;
  projectName: string;
  attemptIndex: number;
  name: string;
  sourcePath: string;
  caseIndex: number;
  status: 'success' | 'failed';
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
  /** Callback/orchestration failures, separate from action and cleanup failures. */
  executionErrors?: WorkflowError[];
  teardownErrors?: WorkflowError[];
  reportPaths?: string[];
  reportSources?: WorkflowReportSource[];
  /** Agent report ownership scope; defaults to the execution scope run ID. */
  reportScopeId?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface WorkflowDocumentRunResult {
  documentId: string;
  documentRunId: string;
  /** Whole-document attempt, distinct from Case attemptIndex. */
  attemptIndex?: number;
  projectId: string;
  projectName: string;
  sourcePath: string;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  beforeAll: StepRunResult[];
  afterAll: StepRunResult[];
  executionErrors?: WorkflowError[];
  /** Host lifecycle failures; these are not authored workflow hooks. */
  hostErrors?: WorkflowHostError[];
  teardownErrors?: WorkflowError[];
  reportPaths?: string[];
  reportSources?: WorkflowReportSource[];
  /** Agent report ownership scope; defaults to the execution scope run ID. */
  reportScopeId?: string;
}

export interface WorkflowHostError {
  phase:
    | 'setup'
    | 'execution'
    | 'cleanup'
    | 'report'
    | 'publication'
    | 'observer';
  error: unknown;
}

export interface CaseExecutionContext {
  readonly caseId: string;
  readonly runId: string;
  readonly projectName: string;
  readonly attemptIndex: number;
  readonly name: string;
  readonly sourcePath: string;
  readonly caseIndex: number;
}

export interface NodeCaseContext extends CaseExecutionContext {
  readonly phase: CaseNodePhase;
  readonly stepIndex: number;
}

export interface NodeDocumentContext {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly sourcePath: string;
  readonly phase: DocumentNodePhase;
  readonly stepIndex: number;
}

export type StepExecutionInfo =
  | {
      scope: 'case';
      node: string;
      stepCount: number;
      case: NodeCaseContext;
      document?: never;
    }
  | {
      scope: 'document';
      node: string;
      stepCount: number;
      document: NodeDocumentContext;
      case?: never;
    };

export type StepStartHandler = (info: StepExecutionInfo) => Awaitable<unknown>;
export type StepResultHandler = (
  info: StepExecutionInfo,
  result: StepRunResult,
) => Awaitable<unknown>;

export interface RunCollectedCaseOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  beforeEach?: readonly NormalizedStep[];
  afterEach?: readonly NormalizedStep[];
  context?: TContext;
  projectName?: string;
  attemptIndex?: number;
  signal?: AbortSignal;
  defaultTimeoutMs?: number;
  onStepStart?: StepStartHandler;
  onStepResult?: StepResultHandler;
  onResult?(result: CaseRunResult): Awaitable<unknown>;
  createRunId?(): string;
  /** Override Agent report ownership when multiple Cases share one Agent. */
  reportScopeId?: string;
}

export type CaseRunStatus = 'success' | 'failed' | 'not-run';

export interface CaseRunOutcome {
  caseId: string;
  projectName: string;
  name: string;
  sourcePath: string;
  caseIndex: number;
  /** Final failure policy compiled from the source document. */
  onFailure?: 'continue' | 'stop-document';
  status: CaseRunStatus;
  run?: CaseRunResult;
  attempts?: readonly CaseRunResult[];
  notRunReason?:
    | 'document-start-failed'
    | 'project-preflight-failed'
    | 'project-setup-failed'
    | 'interrupted'
    | 'bail'
    | 'fatal-error';
}

export interface WorkflowDocumentExecutionResult {
  document: WorkflowDocumentRunResult;
  cases: readonly CaseRunOutcome[];
}

export interface RunWorkflowDocumentOptions<TContext = undefined> {
  documentSetup?: DocumentSetupDefinition<TContext>;
  documentAttemptIndex?: number;
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  project?: WorkflowExecutionProject;
  projectContext?: TContext;
  retry?: number;
  signal?: AbortSignal;
  defaultTimeoutMs?: number;
  shouldStop?(): boolean;
  stopReason?(): NonNullable<CaseRunOutcome['notRunReason']>;
  isFatalError?(result: CaseRunResult): boolean;
  onCaseStart?(collectedCase: CollectedCase): Awaitable<void>;
  onStepStart?: StepStartHandler;
  onStepResult?: StepResultHandler;
  onCaseResult?(result: CaseRunResult): Awaitable<unknown>;
  onCaseOutcome?(result: CaseRunOutcome): Awaitable<unknown>;
  onDocumentResult?(result: WorkflowDocumentRunResult): Awaitable<unknown>;
  createCaseRunId?(collectedCase: CollectedCase, attemptIndex: number): string;
  createDocumentRunId?(document: CollectedWorkflowDocument): string;
  resolveCaseReportScopeId?(
    collectedCase: CollectedCase,
    attemptIndex: number,
    documentRunId: string,
  ): string | undefined;
}

export interface CreateDocumentRuntimeOptions<TContext = undefined> {
  documentSetup?: DocumentSetupDefinition<TContext>;
  documentAttemptIndex?: number;
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  project?: WorkflowExecutionProject;
  projectContext?: TContext;
  signal?: AbortSignal;
  defaultTimeoutMs?: number;
  onStepStart?: StepStartHandler;
  onStepResult?: StepResultHandler;
  onResult?(result: WorkflowDocumentRunResult): Awaitable<unknown>;
  createDocumentRunId?(): string;
}

export interface WorkflowDocumentRuntime<TContext = undefined> {
  readonly signal: AbortSignal;
  readonly context: TContext;
  readonly canRunCases: boolean;
  start(): Promise<WorkflowDocumentRunResult>;
  finish(): Promise<WorkflowDocumentRunResult>;
}

export interface ProjectRuntimeOptions<TProjectContext = unknown> {
  project: ResolvedExecutionProject<TProjectContext>;
  setup?: ProjectSetupDefinition<TProjectContext>;
  signal?: AbortSignal;
}

export interface ProjectRuntimeResult<TProjectContext = unknown> {
  projectName: string;
  status: 'success' | 'failed';
  setupError?: WorkflowError;
  teardownErrors?: readonly WorkflowError[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface ProjectRuntime<TProjectContext = unknown> {
  readonly context: TProjectContext | undefined;
  readonly signal: AbortSignal;
  readonly canRun: boolean;
  start(): Promise<ProjectRuntimeResult<TProjectContext>>;
  finish(
    status?: 'success' | 'failed',
  ): Promise<ProjectRuntimeResult<TProjectContext>>;
  abort(reason?: unknown): void;
}

export interface CaseRunnerOptions<TContext = undefined> {
  nodes?: readonly NodeDefinition<any, any, TContext>[];
  context?: TContext;
}
