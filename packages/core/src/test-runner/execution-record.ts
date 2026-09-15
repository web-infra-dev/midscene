import type {
  WorkflowDocumentExecutionResult,
  WorkflowHostError,
  WorkflowReportSource,
} from './engine/types';
import type { CollectedWorkflowDocument } from './parser/types';

/**
 * One complete document invocation, including work outside the pure kernel.
 * The entry adapter owns resources and records their lifecycle here. A failed
 * setup has a record even though no document could be executed.
 *
 * runId identifies this invocation, not an Agent/report resource. File retries
 * create new records; they do not become per-Case retries. Report projection
 * must not mutate these records or redact the original API output.
 */
export interface WorkflowExecutionRecord {
  readonly runId: string;
  readonly attemptIndex: number;
  readonly sourcePath: string;
  readonly platform: string;
  readonly projectName?: string;
  readonly document: CollectedWorkflowDocument;
  readonly status: 'success' | 'failed';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly execution?: WorkflowDocumentExecutionResult;
  readonly setupError?: unknown;
  readonly executionError?: unknown;
  readonly cleanupErrors: readonly unknown[];
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly reportPaths: readonly string[];
  readonly reportSources?: readonly WorkflowReportSource[];
  readonly children?: readonly WorkflowExecutionRecord[];
  readonly reportError?: unknown;
  /** Entry-owned report copies or result files failed after execution finished. */
  readonly publicationErrors?: readonly unknown[];
  /** Entry progress/result observers failed, independently of action outcomes. */
  readonly observerErrors?: readonly unknown[];
}

/** Complete host facts as a kernel result. Report and summary consume this view. */
export function executionRecordToResult(
  record: WorkflowExecutionRecord,
): WorkflowDocumentExecutionResult {
  const execution = record.execution?.document;
  const hostErrors: WorkflowHostError[] = [...(execution?.hostErrors ?? [])];
  const add = (phase: WorkflowHostError['phase'], error: unknown) => {
    if (error !== undefined) hostErrors.push({ phase, error });
  };
  add('setup', record.setupError);
  add('execution', record.executionError);
  for (const error of record.cleanupErrors) add('cleanup', error);
  add('report', record.reportError);
  for (const error of record.publicationErrors ?? []) add('publication', error);
  for (const error of record.observerErrors ?? []) add('observer', error);
  const projectName =
    record.projectName ?? execution?.projectName ?? record.platform;
  return {
    document: {
      documentId: record.document.documentId,
      documentRunId: record.runId,
      attemptIndex: record.attemptIndex,
      projectId: record.document.projectId,
      projectName,
      sourcePath: record.sourcePath,
      // Case failures are counted separately; host failures must not convert
      // successful Cases into retryable action failures.
      status:
        hostErrors.length || execution?.status === 'failed'
          ? 'failed'
          : 'success',
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      durationMs: record.durationMs,
      beforeAll: execution?.beforeAll ?? [],
      afterAll: execution?.afterAll ?? [],
      ...(hostErrors.length ? { hostErrors } : {}),
      ...(execution?.executionErrors?.length
        ? { executionErrors: execution.executionErrors }
        : {}),
      ...(execution?.teardownErrors?.length
        ? { teardownErrors: execution.teardownErrors }
        : {}),
      reportScopeId: execution?.reportScopeId ?? record.runId,
      reportPaths: [...record.reportPaths],
      ...(record.reportSources?.length
        ? { reportSources: [...record.reportSources] }
        : {}),
    },
    cases:
      record.execution?.cases ??
      record.document.cases.map((item) => ({
        caseId: item.caseId,
        projectName,
        name: item.definition.name,
        sourcePath: item.sourcePath,
        caseIndex: item.caseIndex,
        status: 'not-run' as const,
        notRunReason: 'document-start-failed' as const,
      })),
  };
}

/** Persist execution facts across workers without dropping native Error fields. */
export function serializeWorkflowExecutionRecord(
  record: WorkflowExecutionRecord,
): string {
  return serializeWorkflowValue(record);
}

/** The same error-preserving encoding for entry results and worker envelopes. */
export function serializeWorkflowValue(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, value) =>
      value instanceof Error
        ? {
            name: value.name,
            message: value.message,
            ...('code' in value ? { code: value.code } : {}),
            ...('details' in value ? { details: value.details } : {}),
            ...(value instanceof AggregateError
              ? { errors: value.errors }
              : {}),
          }
        : value,
    2,
  );
}
