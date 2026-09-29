export const TEST_RUN_REPORT_SCRIPT_TYPE = 'midscene_test_run_dump';

export type TestRunReportRunStatus = 'success' | 'failed';
export type TestRunReportCaseStatus = TestRunReportRunStatus | 'not-run';
export type TestRunReportStepPhase =
  | 'beforeAll'
  | 'beforeEach'
  | 'steps'
  | 'afterEach'
  | 'afterAll';

/**
 * A JSON-safe value prepared for display in a Midscene Test report.
 *
 * Paths use JSONPath-like notation rooted at `$`. The path arrays are kept
 * beside the value so the UI never presents redacted or truncated data as if
 * it were complete.
 */
export interface TestRunReportValue {
  value: unknown;
  truncatedPaths?: string[];
  redactedPaths?: string[];
}

export interface TestRunReportError {
  name: string;
  message: string;
  code?: string;
  details?: TestRunReportValue;
}

export interface TestRunReportHostError {
  phase:
    | 'setup'
    | 'execution'
    | 'cleanup'
    | 'report'
    | 'publication'
    | 'observer';
  error: TestRunReportError;
}

export interface TestRunReportDiagnostic {
  level: 'warning' | 'error';
  code:
    | 'agent-detail-unresolved'
    | 'agent-detail-unavailable'
    | 'large-report'
    | 'run-infrastructure-error'
    | 'source-without-executions';
  message: string;
  scopeId?: string;
  executionId?: string;
  sourcePaths?: string[];
}

export interface TestRunReportMetrics {
  modelCallCount: number;
  modelTimeMs: number;
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TestRunReportAgentDetail {
  reportId: string;
  executionId: string;
}

export interface TestRunReportStep {
  id: string;
  phase: TestRunReportStepPhase;
  stepIndex: number;
  node: string;
  title?: string;
  status: TestRunReportRunStatus;
  continuedAfterError: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  input?: TestRunReportValue;
  output?: {
    summary?: string;
    data?: TestRunReportValue;
  };
  error?: TestRunReportError;
  agentDetails?: TestRunReportAgentDetail[];
  agentDetailDiagnostic?: string;
}

export interface TestRunReportAttempt {
  attemptId: string;
  attemptIndex: number;
  status: TestRunReportRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  beforeEach: TestRunReportStep[];
  steps: TestRunReportStep[];
  afterEach: TestRunReportStep[];
  teardownErrors?: TestRunReportError[];
  hostErrors?: TestRunReportHostError[];
  /** Report groups available for scope-level fallback browsing. */
  scopeReportIds?: string[];
}

export interface TestRunReportCase {
  caseId: string;
  name: string;
  caseIndex: number;
  status: TestRunReportCaseStatus;
  notRunReason?: string;
  attempts: TestRunReportAttempt[];
}

export interface TestRunReportDocument {
  documentId: string;
  /** Logical file identity when separate invocations need distinct UI IDs. */
  logicalDocumentId?: string;
  documentRunId?: string;
  attemptIndex?: number;
  sourcePath: string;
  status: TestRunReportRunStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  beforeAll: TestRunReportStep[];
  cases: TestRunReportCase[];
  afterAll: TestRunReportStep[];
  teardownErrors?: TestRunReportError[];
  hostErrors?: TestRunReportHostError[];
  /** Report groups available for scope-level fallback browsing. */
  scopeReportIds?: string[];
  /** Whole-file invocation history; Cases aggregate their own attempts. */
  attempts?: Omit<TestRunReportDocument, 'cases' | 'attempts'>[];
}

export interface TestRunReportCollectionError {
  sourcePath: string;
  error: TestRunReportError;
}

export interface TestRunReportProjectLifecycle {
  status: TestRunReportRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  setupError?: TestRunReportError;
  teardownErrors?: TestRunReportError[];
}

export interface TestRunReportProject {
  projectId: string;
  name: string;
  /** Display identity, also supports legacy custom interface adapters. */
  platform?: string;
  status: TestRunReportRunStatus;
  retry: number;
  lifecycle?: TestRunReportProjectLifecycle;
  documents: TestRunReportDocument[];
  collectionErrors: TestRunReportCollectionError[];
}

export interface TestRunReportSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  filtered: number;
  collectionErrors: number;
  documentFailures: number;
  projectFailures: number;
}

export interface TestRunReportDump {
  schemaVersion: 1;
  kind: 'test-runner';
  runId: string;
  status: TestRunReportRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  summary: TestRunReportSummary;
  metrics: TestRunReportMetrics;
  projects: TestRunReportProject[];
  diagnostics?: TestRunReportDiagnostic[];
}

export interface TestRunReportSource {
  /** Resource/report scope that owns this finalized Midscene Agent report. */
  scopeId: string;
  /** Absolute path to a finalized Midscene Agent report. */
  sourcePath: string;
  /** Current Agent dump JSON; when present, HTML is not parsed for execution data. */
  dumpPath?: string;
}

export interface IndexedTestRunReportSource {
  reportId: string;
  scopeId: string;
  sourcePath: string;
  executionIds: string[];
}

export interface TestRunReportSourceIndex {
  sources: IndexedTestRunReportSource[];
  metrics: TestRunReportMetrics;
}

export interface AssembleTestRunReportOptions {
  outputDir: string;
  /** File or directory name without an extension. */
  reportFileName: string;
  sources: readonly TestRunReportSource[];
  buildRunnerDump(index: TestRunReportSourceIndex): TestRunReportDump;
  overwrite?: boolean;
}
