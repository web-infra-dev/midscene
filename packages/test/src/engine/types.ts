import type {
  ProjectSetupDefinition,
  ResolvedExecutionProject,
} from '../cli/test-project';
import type { WorkflowError } from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  NormalizedStep,
  NormalizedStepMeta,
} from '../parser/types';

export type Awaitable<T> = T | Promise<T>;

export interface NodeScopeTeardownResult {
  /** Absolute paths to Midscene reports produced by this execution scope. */
  reportPaths?: readonly string[];
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
}

export interface NodeHistoryEntry {
  readonly scope: 'document' | 'case';
  readonly phase: NodeExecutionPhase;
  readonly stepIndex: number;
  readonly node: string;
  readonly input?: unknown;
  readonly intent?: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly summary?: string;
  readonly data?: unknown;
  readonly error?: { readonly name: string; readonly message: string };
}

export interface CaseRunResult {
  caseId: string;
  runId: string;
  projectName: string;
  repeatIndex: number;
  attemptIndex: number;
  name: string;
  sourcePath: string;
  caseIndex: number;
  status: 'success' | 'failed';
  beforeEach: StepRunResult[];
  steps: StepRunResult[];
  afterEach: StepRunResult[];
  teardownErrors?: WorkflowError[];
  reportPaths?: string[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface WorkflowDocumentRunResult {
  documentId: string;
  documentRunId: string;
  projectId: string;
  projectName: string;
  repeatIndex: number;
  sourcePath: string;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  beforeAll: StepRunResult[];
  afterAll: StepRunResult[];
  teardownErrors?: WorkflowError[];
  reportPaths?: string[];
}

export interface CaseExecutionContext {
  readonly caseId: string;
  readonly runId: string;
  readonly projectName: string;
  readonly repeatIndex: number;
  readonly attemptIndex: number;
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
  readonly projectName: string;
  readonly repeatIndex: number;
  readonly sourcePath: string;
  readonly phase: DocumentNodePhase;
  readonly stepIndex: number;
  readonly completedNodes: readonly StepRunResult[];
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
  repeatIndex?: number;
  attemptIndex?: number;
  documentHistory?: readonly NodeHistoryEntry[];
  signal?: AbortSignal;
  defaultTimeoutMs?: number;
  onStepStart?: StepStartHandler;
  onStepResult?: StepResultHandler;
  onResult?(result: CaseRunResult): Awaitable<unknown>;
  createRunId?(): string;
}

export type CaseRunStatus = 'success' | 'failed' | 'not-run';

export interface CaseRunOutcome {
  caseId: string;
  projectName: string;
  repeatIndex: number;
  name: string;
  sourcePath: string;
  caseIndex: number;
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
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  project?: ResolvedExecutionProject<TContext>;
  projectContext?: TContext;
  repeatIndex?: number;
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
}

export interface CreateDocumentRuntimeOptions<TContext = undefined> {
  resolveNode(name: string): NodeDefinition<any, any, TContext>;
  project?: ResolvedExecutionProject<TContext>;
  projectContext?: TContext;
  repeatIndex?: number;
  signal?: AbortSignal;
  defaultTimeoutMs?: number;
  onStepStart?: StepStartHandler;
  onStepResult?: StepResultHandler;
  onResult?(result: WorkflowDocumentRunResult): Awaitable<unknown>;
  createDocumentRunId?(): string;
}

export interface WorkflowDocumentRuntime<TContext = undefined> {
  readonly context: TContext;
  readonly history: readonly NodeHistoryEntry[];
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
  platform: string;
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
