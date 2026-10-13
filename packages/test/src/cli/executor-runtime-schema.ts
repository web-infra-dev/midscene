import { z } from 'zod/v4';

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
const time = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative();
const value = z.strictObject({
  value: json,
  truncatedPaths: z.array(z.string()).optional(),
  redactedPaths: z.array(z.string()).optional(),
});

export interface ExecutorReportError {
  format?: 'midscene-error';
  name: string;
  message: string;
  code?: string;
  details?: {
    value: JsonValue;
    truncatedPaths?: string[];
    redactedPaths?: string[];
  };
  cause?: ExecutorReportError;
  errors?: ExecutorReportError[];
  truncated?: boolean;
}
export const reportErrorSchema: z.ZodType<ExecutorReportError> = z.lazy(() =>
  z.strictObject({
    format: z.literal('midscene-error').optional(),
    name: z.string(),
    message: z.string(),
    code: z.string().optional(),
    details: value.optional(),
    cause: reportErrorSchema.optional(),
    errors: z.array(reportErrorSchema).optional(),
    truncated: z.boolean().optional(),
  }),
);
const operation = z.strictObject({
  operationId: z.string().min(1),
  scopeId: z.string().optional(),
  stepId: z.string().optional(),
  node: z.string().optional(),
});
export const cleanupSchema = z.strictObject({
  status: z.enum(['not-required', 'completed', 'pending', 'failed']),
  capturedAt: time,
  operationId: z.string().optional(),
  blockingOperations: z.array(operation).optional(),
  error: reportErrorSchema.optional(),
});
export const pendingOperationsSchema = z.array(operation);
const collectionStatus = z.enum(['complete', 'partial', 'unknown']);
export const metricsSchema = z.strictObject({
  modelCallCount: count,
  modelTimeMs: z.number().finite().nonnegative(),
  promptTokens: count,
  cachedInputTokens: count,
  completionTokens: count,
  totalTokens: count,
  collection: z
    .strictObject({
      status: collectionStatus,
      expectedExecutionCount: count,
      capturedExecutionCount: count,
      reasons: z.array(z.string()),
      fields: z
        .strictObject({
          modelCallCount: collectionStatus,
          modelTimeMs: collectionStatus,
          totalTokens: collectionStatus,
        })
        .optional(),
    })
    .optional(),
});
export const operationsSchema = z.strictObject({
  capturedAt: time,
  events: z.array(
    z.strictObject({
      operationId: z.string().min(1),
      operationKind: z.enum([
        'node',
        'resource',
        'acquisition',
        'cleanup',
        'readiness',
      ]),
      kind: z.enum([
        'started',
        'cancel-requested',
        'settled',
        'runner-returned',
        'cleanup-deferred',
      ]),
      at: time,
      stepId: z.string().optional(),
      scopeId: z.string().optional(),
      node: z.string().optional(),
      status: z.enum(['success', 'failed', 'not-run']).optional(),
      pending: z.boolean().optional(),
      error: reportErrorSchema.optional(),
      blockingOperations: z.array(operation).optional(),
    }),
  ),
});
export const runtimeResultFields = {
  executionStatus: z.enum(['success', 'failed', 'not-run']).optional(),
  phases: z
    .partialRecord(
      z.enum(['beforeAll', 'beforeEach', 'steps', 'afterEach', 'afterAll']),
      z.strictObject({
        status: z.enum(['success', 'failed', 'not-run', 'not-required']),
        plannedStepCount: count,
        executedStepCount: count,
      }),
    )
    .optional(),
  cleanup: cleanupSchema.optional(),
  pendingOperations: pendingOperationsSchema.optional(),
  retryDecision: z
    .strictObject({
      scope: z.enum(['case', 'document']),
      retryCount: count,
      attemptIndex: count,
      decision: z.enum(['retry', 'stop']),
      reason: z.enum([
        'passed',
        'attempt-failed',
        'budget-exhausted',
        'cleanup-pending',
        'cleanup-failed',
        'operation-pending',
        'fatal-error',
        'interrupted',
        'bail',
        'infrastructure-error',
      ]),
    })
    .optional(),
};
export type ExecutorRuntimeResult = z.infer<
  z.ZodObject<typeof runtimeResultFields>
>;
const plannedStep = z.strictObject({
  id: z.string(),
  phase: z.enum(['beforeAll', 'beforeEach', 'steps', 'afterEach', 'afterAll']),
  stepIndex: count,
  node: z.string(),
  title: z.string().optional(),
  input: value,
  inputMode: z.enum(['template', 'resolved']),
  timeoutMs: z.number().positive().optional(),
  continueOnError: z.boolean(),
});
export const documentPlanSchema = z.strictObject({
  documentId: z.string(),
  sourcePath: z.string(),
  sourceYaml: value.optional(),
  retry: z.strictObject({ scope: z.enum(['case', 'document']), count }),
  beforeAll: z.array(plannedStep),
  afterAll: z.array(plannedStep),
  cases: z.array(
    z.strictObject({
      caseId: z.string(),
      name: z.string(),
      caseIndex: count,
      selected: z.boolean(),
      tags: z.array(z.string()),
      onFailure: z.enum(['continue', 'stop-document']).optional(),
      beforeEach: z.array(plannedStep),
      steps: z.array(plannedStep),
      afterEach: z.array(plannedStep),
    }),
  ),
});
