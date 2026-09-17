import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
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

export type TestExecutorJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly TestExecutorJsonValue[]
  | { readonly [key: string]: TestExecutorJsonValue };

export interface TestExecutorErrorDto {
  readonly name: string;
  readonly message: string;
  readonly code: string;
  readonly details?: TestExecutorJsonValue;
}

export interface TestExecutorStepResultDto {
  readonly phase:
    | 'beforeAll'
    | 'beforeEach'
    | 'steps'
    | 'afterEach'
    | 'afterAll';
  readonly stepIndex: number;
  readonly node: string;
  readonly input: TestExecutorJsonValue;
  readonly meta: {
    readonly timeoutMs?: number;
    readonly continueOnError: boolean;
  };
  readonly status: 'success' | 'failed';
  readonly continuedAfterError: boolean;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly output?: {
    readonly summary?: string;
    readonly data?: TestExecutorJsonValue;
  };
  readonly error?: TestExecutorErrorDto;
  readonly report?: {
    readonly traces: readonly {
      readonly type: 'midscene-execution';
      readonly executionId: string;
    }[];
  };
}

export interface TestExecutorCaseAttemptDto {
  readonly caseId: string;
  readonly runId: string;
  readonly projectName: string;
  readonly attemptIndex: number;
  readonly name: string;
  readonly sourcePath: string;
  readonly caseIndex: number;
  readonly status: 'success' | 'failed';
  readonly beforeEach: readonly TestExecutorStepResultDto[];
  readonly steps: readonly TestExecutorStepResultDto[];
  readonly afterEach: readonly TestExecutorStepResultDto[];
  readonly teardownErrors?: readonly TestExecutorErrorDto[];
  /** Opaque references returned by context.materializeReport(). */
  readonly reportRefs?: readonly string[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
}

export interface TestExecutorCaseOutcomeDto {
  readonly documentId: string;
  readonly caseId: string;
  readonly projectName: string;
  readonly name: string;
  readonly sourcePath: string;
  readonly caseIndex: number;
  readonly status: 'success' | 'failed' | 'not-run';
  readonly run?: TestExecutorCaseAttemptDto;
  readonly attempts?: readonly TestExecutorCaseAttemptDto[];
  readonly notRunReason?:
    | 'document-start-failed'
    | 'project-preflight-failed'
    | 'project-setup-failed'
    | 'interrupted'
    | 'bail'
    | 'fatal-error'
    | 'executor-failed';
}

export interface TestExecutorDocumentResultDto {
  readonly documentId: string;
  readonly documentRunId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly sourcePath: string;
  readonly status: 'success' | 'failed';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly beforeAll: readonly TestExecutorStepResultDto[];
  readonly afterAll: readonly TestExecutorStepResultDto[];
  readonly teardownErrors?: readonly TestExecutorErrorDto[];
  /** Opaque references returned by context.materializeReport(). */
  readonly reportRefs?: readonly string[];
}

export interface TestExecutorLifecycleResultDto {
  readonly projectName: string;
  readonly status: 'success' | 'failed';
  readonly setupError?: TestExecutorErrorDto;
  readonly teardownErrors?: readonly TestExecutorErrorDto[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
}

/** JSON-safe result crossing the Test Executor boundary. */
export interface TestCaseTaskRunResult {
  readonly case: TestExecutorCaseOutcomeDto;
  readonly document?: TestExecutorDocumentResultDto;
  readonly lifecycle?: TestExecutorLifecycleResultDto;
  readonly artifacts?: readonly TestCaseArtifact[];
  readonly metadata?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

export interface TestCaseArtifact {
  readonly name: string;
  /** URL or artifact identifier; never interpreted as a local report path. */
  readonly uri: string;
  readonly mediaType?: string;
}

export interface TestExecutorContext {
  readonly signal: AbortSignal;
  readonly runLocal: () => Promise<TestCaseTaskRunResult>;
  readonly onProgress: (message: string) => void;
  /** Directory reserved for files materialized by this task. */
  readonly outputDir: string;
  /** Copy a trusted local report into outputDir and return an opaque reference. */
  readonly materializeReport: (sourcePath: string) => string;
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

/** Runs one isolated Midscene case locally or through an external service. */
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

const jsonValueSchema: z.ZodType<TestExecutorJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const timestampSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'Expected an ISO-compatible timestamp.',
  });
const errorSchema = z.strictObject({
  name: z.string().min(1),
  message: z.string(),
  code: z.string().min(1),
  details: jsonValueSchema.optional(),
});
const stepSchema = z.strictObject({
  phase: z.enum(['beforeAll', 'beforeEach', 'steps', 'afterEach', 'afterAll']),
  stepIndex: z.number().int().nonnegative(),
  node: z.string().min(1),
  input: jsonValueSchema,
  meta: z.strictObject({
    timeoutMs: z.number().positive().finite().optional(),
    continueOnError: z.boolean(),
  }),
  status: z.enum(['success', 'failed']),
  continuedAfterError: z.boolean(),
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  durationMs: z.number().nonnegative().finite(),
  output: z
    .strictObject({
      summary: z.string().optional(),
      data: jsonValueSchema.optional(),
    })
    .optional(),
  error: errorSchema.optional(),
  report: z
    .strictObject({
      traces: z.array(
        z.strictObject({
          type: z.literal('midscene-execution'),
          executionId: z.string().min(1),
        }),
      ),
    })
    .optional(),
});
const attemptSchema = z.strictObject({
  caseId: z.string().min(1),
  runId: z.string().min(1),
  projectName: z.string().min(1),
  attemptIndex: z.number().int().nonnegative(),
  name: z.string(),
  sourcePath: z.string().min(1),
  caseIndex: z.number().int().nonnegative(),
  status: z.enum(['success', 'failed']),
  beforeEach: z.array(stepSchema),
  steps: z.array(stepSchema),
  afterEach: z.array(stepSchema),
  teardownErrors: z.array(errorSchema).optional(),
  reportRefs: z.array(z.string().min(1)).optional(),
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  durationMs: z.number().nonnegative().finite(),
});
const notRunReasonSchema = z.enum([
  'document-start-failed',
  'project-preflight-failed',
  'project-setup-failed',
  'interrupted',
  'bail',
  'fatal-error',
  'executor-failed',
]);
const resultSchema = z.strictObject({
  case: z.strictObject({
    documentId: z.string().min(1),
    caseId: z.string().min(1),
    projectName: z.string().min(1),
    name: z.string(),
    sourcePath: z.string().min(1),
    caseIndex: z.number().int().nonnegative(),
    status: z.enum(['success', 'failed', 'not-run']),
    run: attemptSchema.optional(),
    attempts: z.array(attemptSchema).optional(),
    notRunReason: notRunReasonSchema.optional(),
  }),
  document: z
    .strictObject({
      documentId: z.string().min(1),
      documentRunId: z.string().min(1),
      projectId: z.string().min(1),
      projectName: z.string().min(1),
      sourcePath: z.string().min(1),
      status: z.enum(['success', 'failed']),
      startedAt: timestampSchema,
      endedAt: timestampSchema,
      durationMs: z.number().nonnegative().finite(),
      beforeAll: z.array(stepSchema),
      afterAll: z.array(stepSchema),
      teardownErrors: z.array(errorSchema).optional(),
      reportRefs: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  lifecycle: z
    .strictObject({
      projectName: z.string().min(1),
      status: z.enum(['success', 'failed']),
      setupError: errorSchema.optional(),
      teardownErrors: z.array(errorSchema).optional(),
      startedAt: timestampSchema,
      endedAt: timestampSchema,
      durationMs: z.number().nonnegative().finite(),
    })
    .optional(),
  artifacts: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        uri: z.string().min(1),
        mediaType: z.string().min(1).optional(),
      }),
    )
    .optional(),
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
    )
    .optional(),
});

const attemptMatchesTask = (
  task: TestCaseTask,
  attempt: TestExecutorCaseAttemptDto,
): boolean =>
  attempt.caseId === task.caseId &&
  attempt.projectName === task.projectName &&
  attempt.name === task.caseName &&
  attempt.sourcePath === task.sourcePath &&
  attempt.caseIndex === task.caseIndex &&
  isSafeResultPathSegment(attempt.runId);

/** Validate the complete, JSON-safe DTO returned across an Executor boundary. */
export function assertTestCaseTaskRunResult(
  task: TestCaseTask,
  value: unknown,
): asserts value is TestCaseTaskRunResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(
      `Executor returned invalid transport data for ${task.caseId}: ${z.prettifyError(parsed.error)}`,
    );
  }
  const outcome = parsed.data.case;
  if (
    outcome.caseId !== task.caseId ||
    outcome.documentId !== task.documentId ||
    outcome.projectName !== task.projectName ||
    outcome.name !== task.caseName ||
    outcome.sourcePath !== task.sourcePath ||
    outcome.caseIndex !== task.caseIndex
  ) {
    throw new Error(
      `Executor returned a result that does not match task ${task.caseId}.`,
    );
  }
  const attempts = outcome.attempts ?? [];
  if (attempts.some((attempt) => !attemptMatchesTask(task, attempt))) {
    throw new TypeError(
      `Executor returned invalid attempts for ${task.caseId}.`,
    );
  }
  if (
    attempts.some((attempt, index) => attempt.attemptIndex !== index) ||
    attempts.length > task.retry + 1
  ) {
    throw new TypeError(
      `Executor returned a non-sequential attempt history for ${task.caseId}.`,
    );
  }
  const finalAttempt = attempts.at(-1);
  if (outcome.status === 'not-run') {
    if (outcome.run || attempts.length || !outcome.notRunReason) {
      throw new TypeError(
        `Executor returned an inconsistent not-run result for ${task.caseId}.`,
      );
    }
  } else if (
    !outcome.run ||
    !finalAttempt ||
    finalAttempt.status !== outcome.status ||
    outcome.run.runId !== finalAttempt.runId ||
    JSON.stringify(outcome.run) !== JSON.stringify(finalAttempt) ||
    attempts.slice(0, -1).some((attempt) => attempt.status !== 'failed')
  ) {
    throw new TypeError(
      `Executor returned an inconsistent ${outcome.status} result for ${task.caseId}.`,
    );
  }
  const reportRefs = [
    ...attempts.flatMap((attempt) => attempt.reportRefs ?? []),
    ...(parsed.data.document?.reportRefs ?? []),
  ];
  if (reportRefs.some((reference) => !isSafeResultPathSegment(reference))) {
    throw new TypeError(
      `Executor returned an invalid report reference for ${task.caseId}.`,
    );
  }
  const document = parsed.data.document;
  if (
    document &&
    (document.documentId !== task.documentId ||
      document.projectId !== task.projectId ||
      document.projectName !== task.projectName ||
      document.sourcePath !== task.sourcePath ||
      !isSafeResultPathSegment(document.documentRunId))
  ) {
    throw new Error(
      `Executor returned a document that does not match task ${task.caseId}.`,
    );
  }
  if (
    parsed.data.lifecycle &&
    parsed.data.lifecycle.projectName !== task.projectName
  ) {
    throw new Error(
      `Executor returned a lifecycle that does not match task ${task.caseId}.`,
    );
  }
}
