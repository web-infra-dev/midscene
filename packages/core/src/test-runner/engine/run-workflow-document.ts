import { isResourceRecoveryError } from '../errors';
import type { CollectedCase, CollectedWorkflowDocument } from '../parser/types';
import { buildTestRunReportPlan } from '../reporting/test-plan';
import { createDocumentRuntime } from './document-runtime';
import {
  WorkflowExecutionFailure,
  asExecutionError,
} from './execution-failure';
import { decideRetry } from './result-metadata';
import { runCollectedCase } from './run-collected-case';
import type {
  CaseRunOutcome,
  CaseRunResult,
  RunWorkflowDocumentOptions,
  WorkflowDocumentExecutionResult,
  WorkflowDocumentRunResult,
} from './types';

const asNotRun = (
  collectedCase: CollectedCase,
  projectName: string,
  reason: NonNullable<CaseRunOutcome['notRunReason']>,
): CaseRunOutcome => ({
  caseId: collectedCase.caseId,
  projectName,
  name: collectedCase.definition.name,
  sourcePath: collectedCase.sourcePath,
  caseIndex: collectedCase.caseIndex,
  ...(collectedCase.definition.onFailure
    ? { onFailure: collectedCase.definition.onFailure }
    : {}),
  status: 'not-run',
  notRunReason: reason,
});

export async function runWorkflowDocument<TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: RunWorkflowDocumentOptions<TContext>,
): Promise<WorkflowDocumentExecutionResult> {
  const signal = options.signal ?? new AbortController().signal;
  const createDocumentRunId = options.createDocumentRunId;
  const createCaseRunId = options.createCaseRunId;
  const projectName = options.project?.name ?? document.projectId;
  const retry = options.retry ?? options.project?.retry ?? 0;
  if (!Number.isInteger(retry) || retry < 0) {
    throw new TypeError(
      'Workflow document retry must be a non-negative integer.',
    );
  }
  const runtime = createDocumentRuntime(document, {
    plan:
      options.plan ??
      buildTestRunReportPlan(document, {
        defaultTimeoutMs: options.defaultTimeoutMs,
        retry: { scope: 'case', count: retry },
      }),
    documentSetup: options.documentSetup,
    setupTimeoutMs: options.setupTimeoutMs,
    teardownTimeoutMs: options.teardownTimeoutMs,
    documentAttemptIndex: options.documentAttemptIndex,
    resolveNode: options.resolveNode,
    project: options.project,
    projectContext: options.projectContext,
    signal,
    defaultTimeoutMs: options.defaultTimeoutMs,
    onStepStart: options.onStepStart,
    onStepResult: options.onStepResult,
    onResult: async (result) => {
      await options.documentSetup?.onDocumentResult?.(result, runtime.context);
      await options.onDocumentResult?.(result);
    },
    createDocumentRunId: createDocumentRunId
      ? () => createDocumentRunId(document)
      : undefined,
  });
  const cases: CaseRunOutcome[] = [];
  let runtimeStarted = false;
  let documentResult: WorkflowDocumentRunResult | undefined;
  const executionErrors: unknown[] = [];
  let fatalError = false;
  let documentStopReason: CaseRunOutcome['notRunReason'];

  try {
    runtimeStarted = true;
    const startedDocument = await runtime.start();

    if (!runtime.canRunCases) {
      const reason = signal.aborted
        ? (options.stopReason?.() ?? 'interrupted')
        : 'document-start-failed';
      cases.push(
        ...document.cases.map((collectedCase) =>
          asNotRun(collectedCase, projectName, reason),
        ),
      );
    } else {
      for (const collectedCase of document.cases) {
        if (
          documentStopReason ||
          fatalError ||
          signal.aborted ||
          options.shouldStop?.()
        ) {
          const outcome = asNotRun(
            collectedCase,
            projectName,
            signal.aborted
              ? (options.stopReason?.() ?? 'interrupted')
              : fatalError
                ? 'fatal-error'
                : (documentStopReason ??
                  options.stopReason?.() ??
                  'interrupted'),
          );
          cases.push(outcome);
          await options.onCaseOutcome?.(outcome);
          continue;
        }

        await options.onCaseStart?.(collectedCase);
        const attempts = [];
        for (let attemptIndex = 0; attemptIndex <= retry; attemptIndex += 1) {
          let attemptFatalError = false;
          let attemptFailure:
            | WorkflowExecutionFailure<CaseRunResult>
            | undefined;
          const run = await runCollectedCase(collectedCase, {
            resolveNode: options.resolveNode,
            beforeEach: document.lifecycle.beforeEach,
            afterEach: document.lifecycle.afterEach,
            context: runtime.context,
            projectName,
            attemptIndex,
            signal: runtime.signal,
            defaultTimeoutMs: options.defaultTimeoutMs,
            teardownTimeoutMs: options.teardownTimeoutMs,
            onStepStart: options.onStepStart,
            onStepResult: options.onStepResult,
            onResult: async (result) => {
              attemptFatalError = options.isFatalError?.(result) ?? false;
              result.retryDecision = decideRetry({
                scope: 'case',
                retryCount: retry,
                attemptIndex,
                status: result.status,
                cleanupPending: result.cleanup?.status === 'pending',
                operationPending: !!result.pendingOperations?.length,
                cleanupFailed:
                  result.cleanup?.status === 'failed' ||
                  !!result.teardownErrors?.length,
                infrastructureError: result.executionErrors?.some(
                  (error) => !isResourceRecoveryError(error),
                ),
                fatalError: attemptFatalError,
                interrupted: signal.aborted,
                shouldStop: options.shouldStop?.(),
              });
              await options.onCaseResult?.(result);
            },
            reportScopeId: options.resolveCaseReportScopeId?.(
              collectedCase,
              attemptIndex,
              startedDocument.documentRunId,
            ),
            createRunId: createCaseRunId
              ? () => createCaseRunId(collectedCase, attemptIndex)
              : undefined,
          }).catch((error: unknown) => {
            if (!(error instanceof WorkflowExecutionFailure)) throw error;
            attemptFailure = error as WorkflowExecutionFailure<CaseRunResult>;
            return attemptFailure.result;
          });
          attempts.push(run);
          if (
            attemptFailure &&
            !attemptFailure.errors.every(isResourceRecoveryError)
          ) {
            run.retryDecision = decideRetry({
              scope: 'case',
              retryCount: retry,
              attemptIndex,
              status: run.status,
              infrastructureError: true,
            });
            cases.push({
              caseId: collectedCase.caseId,
              projectName,
              name: collectedCase.definition.name,
              sourcePath: collectedCase.sourcePath,
              caseIndex: collectedCase.caseIndex,
              ...(collectedCase.definition.onFailure
                ? { onFailure: collectedCase.definition.onFailure }
                : {}),
              status: 'failed',
              run,
              attempts,
            });
            throw attemptFailure;
          }
          fatalError = attemptFatalError;
          // Result callbacks can interrupt execution or trigger bail. Observe
          // that boundary again before admitting another attempt.
          run.retryDecision = decideRetry({
            scope: 'case',
            retryCount: retry,
            attemptIndex,
            status: run.status,
            cleanupPending: run.cleanup?.status === 'pending',
            cleanupFailed:
              run.cleanup?.status === 'failed' || !!run.teardownErrors?.length,
            operationPending: !!run.pendingOperations?.length,
            fatalError:
              fatalError ||
              !!run.executionErrors?.some(isResourceRecoveryError),
            interrupted: signal.aborted,
            shouldStop: options.shouldStop?.(),
          });
          if (run.retryDecision?.decision !== 'retry') break;
        }
        const run = attempts.at(-1)!;
        const outcome: CaseRunOutcome = {
          caseId: collectedCase.caseId,
          projectName,
          name: collectedCase.definition.name,
          sourcePath: collectedCase.sourcePath,
          caseIndex: collectedCase.caseIndex,
          ...(collectedCase.definition.onFailure
            ? { onFailure: collectedCase.definition.onFailure }
            : {}),
          status: run.status,
          run,
          attempts,
        };
        cases.push(outcome);
        const retryStopReason = run.retryDecision?.reason;
        documentStopReason =
          retryStopReason === 'cleanup-pending' ||
          retryStopReason === 'cleanup-failed' ||
          retryStopReason === 'operation-pending' ||
          retryStopReason === 'fatal-error'
            ? retryStopReason
            : outcome.status === 'failed' &&
                collectedCase.definition.onFailure === 'stop-document'
              ? 'bail'
              : undefined;
        await options.onCaseOutcome?.(outcome);
      }
    }
  } catch (error) {
    executionErrors.push(
      ...(error instanceof WorkflowExecutionFailure ? error.errors : [error]),
    );
  } finally {
    if (runtimeStarted) {
      try {
        documentResult = await runtime.finish();
      } catch (error) {
        if (error instanceof WorkflowExecutionFailure) {
          documentResult = error.result as WorkflowDocumentRunResult;
          for (const failure of error.errors)
            if (!executionErrors.includes(failure))
              executionErrors.push(failure);
        } else executionErrors.push(error);
      }
    }
  }

  if (!documentResult) {
    if (executionErrors.length)
      throw new AggregateError(
        executionErrors,
        'Workflow execution did not produce a document result.',
      );
    throw new Error(
      `Workflow document "${document.sourcePath}" did not produce a result.`,
    );
  }
  if (executionErrors.length) {
    const completed = new Set(cases.map((outcome) => outcome.caseId));
    cases.push(
      ...document.cases
        .filter((item) => !completed.has(item.caseId))
        .map((item) =>
          asNotRun(
            item,
            projectName,
            executionErrors.every(isResourceRecoveryError)
              ? 'operation-pending'
              : 'interrupted',
          ),
        ),
    );
    documentResult.status = 'failed';
    documentResult.executionErrors = executionErrors
      .filter(
        (error) =>
          !documentResult.hostErrors?.some((host) => host.error === error),
      )
      .map(asExecutionError);
    throw new WorkflowExecutionFailure(
      { document: documentResult, cases },
      executionErrors,
    );
  }
  return { document: documentResult, cases };
}
