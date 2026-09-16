import type {
  Awaitable,
  CaseRunOutcome,
  ProjectRuntimeResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import { isSafeResultPathSegment } from '../result-path-segment';

export interface TestCaseTask {
  readonly taskId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly documentId: string;
  readonly sourcePath: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly caseIndex: number;
  readonly tags: readonly string[];
  readonly resources: readonly string[];
  readonly retry: number;
}

export interface TestCaseTaskRunResult {
  readonly case: CaseRunOutcome & { readonly documentId: string };
  readonly document?: WorkflowDocumentRunResult;
  readonly lifecycle?: ProjectRuntimeResult;
  readonly artifacts?: readonly TestCaseArtifact[];
  readonly metadata?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

export interface TestCaseArtifact {
  readonly name: string;
  /** Local path or URL made available by the Executor. */
  readonly uri: string;
  readonly mediaType?: string;
}

export interface TestExecutorContext {
  readonly signal: AbortSignal;
  readonly runLocal: () => Promise<TestCaseTaskRunResult>;
  readonly onProgress: (message: string) => void;
}

export type TestExecutorFailureKind =
  | 'provision'
  | 'transport'
  | 'cleanup'
  | 'report'
  | 'unknown';

export class TestExecutorError extends Error {
  readonly kind: TestExecutorFailureKind;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      kind?: TestExecutorFailureKind;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'TestExecutorError';
    this.kind = options.kind ?? 'unknown';
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Runs one isolated Midscene case. Implementations may execute locally or
 * delegate to another process, container, device farm, or remote service.
 */
export interface TestExecutor {
  readonly name: string;
  readonly execute: (
    task: TestCaseTask,
    context: TestExecutorContext,
  ) => Awaitable<TestCaseTaskRunResult>;
}

export const defineTestExecutor = <TExecutor extends TestExecutor>(
  executor: TExecutor,
): TExecutor => executor;

export const localTestExecutor: TestExecutor = Object.freeze({
  name: 'local',
  execute: (_task: TestCaseTask, context: TestExecutorContext) =>
    context.runLocal(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isCaseAttempt = (task: TestCaseTask, value: unknown): boolean =>
  isRecord(value) &&
  value.caseId === task.caseId &&
  value.projectName === task.projectName &&
  value.name === task.caseName &&
  value.sourcePath === task.sourcePath &&
  value.caseIndex === task.caseIndex &&
  ['success', 'failed'].includes(String(value.status)) &&
  isSafeResultPathSegment(value.runId) &&
  Number.isInteger(value.attemptIndex) &&
  Array.isArray(value.beforeEach) &&
  Array.isArray(value.steps) &&
  Array.isArray(value.afterEach) &&
  typeof value.startedAt === 'string' &&
  typeof value.endedAt === 'string' &&
  typeof value.durationMs === 'number' &&
  (value.reportPaths === undefined || isStringArray(value.reportPaths)) &&
  (value.teardownErrors === undefined || Array.isArray(value.teardownErrors));

const hasOnlyMetadataValues = (value: unknown): boolean =>
  isRecord(value) &&
  Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item)) ||
      typeof item === 'boolean',
  );

/** Validate data returned across an Executor transport boundary. */
export function assertTestCaseTaskRunResult(
  task: TestCaseTask,
  value: unknown,
): asserts value is TestCaseTaskRunResult {
  if (!isRecord(value) || !isRecord(value.case)) {
    throw new TypeError(
      `Executor did not return a case result for ${task.caseId}.`,
    );
  }
  const outcome = value.case;
  const matchesTask =
    outcome.caseId === task.caseId &&
    outcome.documentId === task.documentId &&
    outcome.projectName === task.projectName &&
    outcome.name === task.caseName &&
    outcome.sourcePath === task.sourcePath &&
    outcome.caseIndex === task.caseIndex;
  if (!matchesTask) {
    throw new Error(
      `Executor returned a result that does not match task ${task.caseId}.`,
    );
  }
  if (!['success', 'failed', 'not-run'].includes(String(outcome.status))) {
    throw new TypeError(
      `Executor returned an invalid case status for ${task.caseId}.`,
    );
  }
  if (outcome.run !== undefined && !isCaseAttempt(task, outcome.run)) {
    throw new TypeError(
      `Executor returned an invalid case run for ${task.caseId}.`,
    );
  }
  if (
    outcome.attempts !== undefined &&
    (!Array.isArray(outcome.attempts) ||
      outcome.attempts.some((attempt) => !isCaseAttempt(task, attempt)))
  ) {
    throw new TypeError(
      `Executor returned invalid case attempts for ${task.caseId}.`,
    );
  }
  if (value.document !== undefined) {
    const document = value.document;
    if (
      !isRecord(document) ||
      document.documentId !== task.documentId ||
      document.projectId !== task.projectId ||
      document.projectName !== task.projectName ||
      document.sourcePath !== task.sourcePath
    ) {
      throw new Error(
        `Executor returned a document that does not match task ${task.caseId}.`,
      );
    }
    if (
      !isSafeResultPathSegment(document.documentRunId) ||
      !['success', 'failed'].includes(String(document.status)) ||
      !Array.isArray(document.beforeAll) ||
      !Array.isArray(document.afterAll) ||
      typeof document.startedAt !== 'string' ||
      typeof document.endedAt !== 'string' ||
      typeof document.durationMs !== 'number'
    ) {
      throw new TypeError(
        `Executor returned an invalid document result for ${task.caseId}.`,
      );
    }
  }
  if (
    value.artifacts !== undefined &&
    (!Array.isArray(value.artifacts) ||
      value.artifacts.some(
        (artifact) =>
          !isRecord(artifact) ||
          typeof artifact.name !== 'string' ||
          artifact.name.length === 0 ||
          typeof artifact.uri !== 'string' ||
          artifact.uri.length === 0 ||
          (artifact.mediaType !== undefined &&
            typeof artifact.mediaType !== 'string'),
      ))
  ) {
    throw new TypeError(
      `Executor returned invalid artifacts for ${task.caseId}.`,
    );
  }
  if (value.metadata !== undefined && !hasOnlyMetadataValues(value.metadata)) {
    throw new TypeError(
      `Executor returned invalid metadata for ${task.caseId}.`,
    );
  }
}
