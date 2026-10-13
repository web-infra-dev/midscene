import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { isSafeResultPathSegment } from '../result-path-segment';
import {
  type ExecutorReportError,
  type ExecutorRuntimeResult,
  cleanupSchema,
  documentPlanSchema,
  metricsSchema,
  operationsSchema,
  pendingOperationsSchema,
  reportErrorSchema,
  runtimeResultFields,
} from './executor-runtime-schema';

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
  readonly format?: 'midscene-error';
  readonly cause?: ExecutorReportError;
}

interface TestExecutorStepResultBase {
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
  readonly continuedAfterError: boolean;
  readonly waitForPreviousOperationMs?: number;
  readonly operations?: z.infer<typeof operationsSchema>;
  readonly output?: {
    readonly summary?: string;
    readonly data?: TestExecutorJsonValue;
  };
  readonly error?: TestExecutorErrorDto;
  readonly report?: {
    readonly traces: readonly {
      readonly type: 'midscene-execution';
      readonly executionId: string;
      readonly metrics?: z.infer<typeof metricsSchema>;
    }[];
    readonly collectionErrors?: readonly TestExecutorErrorDto[];
  };
}
export type TestExecutorStepResultDto = TestExecutorStepResultBase &
  (
    | {
        readonly status: 'success' | 'failed';
        readonly startedAt: string;
        readonly endedAt: string;
        readonly durationMs: number;
      }
    | {
        readonly status: 'not-run';
        readonly notRunReason: string;
        readonly blockedBy?: string;
      }
  );

export interface TestExecutorCaseAttemptDto extends ExecutorRuntimeResult {
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
  readonly executionErrors?: readonly TestExecutorErrorDto[];
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
    | 'cleanup-pending'
    | 'cleanup-failed'
    | 'operation-pending'
    | 'executor-failed';
}

export interface TestExecutorDocumentResultDto extends ExecutorRuntimeResult {
  readonly plan?: z.infer<typeof documentPlanSchema>;
  readonly attemptIndex?: number;
  readonly hostErrors?: readonly {
    phase:
      | 'setup'
      | 'execution'
      | 'cleanup'
      | 'report'
      | 'publication'
      | 'observer';
    error: ExecutorReportError;
  }[];
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
  readonly executionErrors?: readonly TestExecutorErrorDto[];
  readonly teardownErrors?: readonly TestExecutorErrorDto[];
  /** Opaque references returned by context.materializeReport(). */
  readonly reportRefs?: readonly string[];
}

export interface TestExecutorLifecycleResultDto {
  readonly cleanup?: z.infer<typeof cleanupSchema>;
  readonly pendingOperations?: z.infer<typeof pendingOperationsSchema>;
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

const executorErrorKey = Symbol.for('@midscene/test/executor-error');

export class TestExecutorError extends Error {
  readonly [executorErrorKey] = true;
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

/** Config and CLI bundles can contain different copies of this constructor. */
export function isTestExecutorError(
  value: unknown,
): value is TestExecutorError {
  return (
    value instanceof Error &&
    Reflect.get(value, executorErrorKey) === true &&
    ['provision', 'transport', 'cleanup', 'report', 'unknown'].includes(
      Reflect.get(value, 'kind'),
    ) &&
    typeof Reflect.get(value, 'retryable') === 'boolean'
  );
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
  format: z.literal('midscene-error').optional(),
  cause: reportErrorSchema.optional(),
  name: z.string().min(1),
  message: z.string(),
  code: z.string().min(1),
  details: jsonValueSchema.optional(),
});
const stepBaseSchema = z.strictObject({
  phase: z.enum(['beforeAll', 'beforeEach', 'steps', 'afterEach', 'afterAll']),
  stepIndex: z.number().int().nonnegative(),
  node: z.string().min(1),
  input: jsonValueSchema,
  meta: z.strictObject({
    timeoutMs: z.number().positive().finite().optional(),
    continueOnError: z.boolean(),
  }),
  continuedAfterError: z.boolean(),
  waitForPreviousOperationMs: z.number().nonnegative().finite().optional(),
  operations: operationsSchema.optional(),
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
          metrics: metricsSchema.optional(),
        }),
      ),
      collectionErrors: z.array(errorSchema).optional(),
    })
    .optional(),
});
const stepSchema = z.discriminatedUnion('status', [
  stepBaseSchema.extend({
    status: z.enum(['success', 'failed']),
    startedAt: timestampSchema,
    endedAt: timestampSchema,
    durationMs: z.number().nonnegative().finite(),
  }),
  stepBaseSchema.extend({
    status: z.literal('not-run'),
    notRunReason: z.string().min(1),
    blockedBy: z.string().optional(),
  }),
]);
const validatedStepSchema = stepSchema.superRefine((step, context) => {
  if (step.status === 'success' && (step.error || step.continuedAfterError)) {
    context.addIssue({
      code: 'custom',
      message: 'Successful steps cannot contain failure evidence.',
    });
  }
  if (step.continuedAfterError && !step.meta.continueOnError) {
    context.addIssue({
      code: 'custom',
      message: 'Continuation requires continueOnError.',
    });
  }
});
const attemptSchema = z.strictObject({
  ...runtimeResultFields,
  caseId: z.string().min(1),
  runId: z.string().min(1),
  projectName: z.string().min(1),
  attemptIndex: z.number().int().nonnegative(),
  name: z.string(),
  sourcePath: z.string().min(1),
  caseIndex: z.number().int().nonnegative(),
  status: z.enum(['success', 'failed']),
  beforeEach: z.array(validatedStepSchema),
  steps: z.array(validatedStepSchema),
  afterEach: z.array(validatedStepSchema),
  executionErrors: z.array(errorSchema).optional(),
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
  'cleanup-pending',
  'cleanup-failed',
  'operation-pending',
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
      ...runtimeResultFields,
      plan: documentPlanSchema.optional(),
      attemptIndex: z.number().int().nonnegative().optional(),
      hostErrors: z
        .array(
          z.strictObject({
            phase: z.enum([
              'setup',
              'execution',
              'cleanup',
              'report',
              'publication',
              'observer',
            ]),
            error: reportErrorSchema,
          }),
        )
        .optional(),
      documentId: z.string().min(1),
      documentRunId: z.string().min(1),
      projectId: z.string().min(1),
      projectName: z.string().min(1),
      sourcePath: z.string().min(1),
      status: z.enum(['success', 'failed']),
      startedAt: timestampSchema,
      endedAt: timestampSchema,
      durationMs: z.number().nonnegative().finite(),
      beforeAll: z.array(validatedStepSchema),
      afterAll: z.array(validatedStepSchema),
      executionErrors: z.array(errorSchema).optional(),
      teardownErrors: z.array(errorSchema).optional(),
      reportRefs: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  lifecycle: z
    .strictObject({
      cleanup: cleanupSchema.optional(),
      pendingOperations: pendingOperationsSchema.optional(),
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

const hasUnfinishedWork = (result: {
  executionStatus?: string;
  cleanup?: { status: string };
  pendingOperations?: readonly unknown[];
}): boolean =>
  (result.executionStatus !== undefined &&
    result.executionStatus !== 'success') ||
  (result.cleanup !== undefined &&
    !['completed', 'not-required'].includes(result.cleanup.status)) ||
  (result.pendingOperations?.length ?? 0) > 0;

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
  for (const attempt of attempts) {
    const steps = [
      ...attempt.beforeEach,
      ...attempt.steps,
      ...attempt.afterEach,
    ];
    if (
      attempt.status === 'success' &&
      (attempt.steps.length === 0 ||
        (attempt.executionErrors?.length ?? 0) > 0 ||
        steps.some((step) => step.status !== 'success') ||
        hasUnfinishedWork(attempt) ||
        (attempt.teardownErrors?.length ?? 0) > 0)
    ) {
      throw new TypeError(
        `Executor returned an inconsistent successful attempt for ${task.caseId}.`,
      );
    }
  }
  if (
    new Set(attempts.map((attempt) => attempt.runId)).size !== attempts.length
  ) {
    throw new TypeError(
      `Executor returned duplicate attempt IDs for ${task.caseId}.`,
    );
  }
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
    outcome.notRunReason !== undefined ||
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
    document?.status === 'success' &&
    (hasUnfinishedWork(document) ||
      (document.hostErrors?.length ?? 0) > 0 ||
      (document.executionErrors?.length ?? 0) > 0 ||
      [...document.beforeAll, ...document.afterAll].some(
        (step) => step.status !== 'success',
      ) ||
      (document.teardownErrors?.length ?? 0) > 0)
  ) {
    throw new TypeError(
      `Executor returned an inconsistent successful document for ${task.caseId}.`,
    );
  }
  const lifecycle = parsed.data.lifecycle;
  if (
    lifecycle?.status === 'success' &&
    (hasUnfinishedWork(lifecycle) ||
      lifecycle.setupError ||
      (lifecycle.teardownErrors?.length ?? 0) > 0)
  ) {
    throw new TypeError(
      `Executor returned an inconsistent successful lifecycle for ${task.caseId}.`,
    );
  }
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
