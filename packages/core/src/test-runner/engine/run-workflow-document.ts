import { WorkflowError } from '../errors';
import type { CollectedCase, CollectedWorkflowDocument } from '../parser/types';
import { createDocumentRuntime } from './document-runtime';
import {
  WorkflowExecutionFailure,
  asExecutionError,
} from './execution-failure';
import { runCollectedCase } from './run-collected-case';
import type {
  CaseRunOutcome,
  CaseRunResult,
  RunWorkflowDocumentOptions,
  StepResultHandler,
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
  const outputs = new Map<string, unknown>();
  const onStepResult: StepResultHandler = async (info, result) => {
    const errors: unknown[] = [];
    try {
      // Observers see the already-recorded, validated Node result.
      await options.onStepResult?.(info, result);
    } catch (error) {
      errors.push(error);
    }
    try {
      const { resultName, resultPath } = result.meta;
      if (resultName !== undefined && result.output?.data !== undefined) {
        let value: unknown = result.output.data;
        // Selecting data is an engine concern: Node-specific wrappers such as
        // { value } must not leak into the naming or publication machinery.
        for (const token of resultPath ? resultPath.slice(1).split('/') : []) {
          const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
          if (
            typeof value !== 'object' ||
            value === null ||
            !Object.prototype.hasOwnProperty.call(value, key)
          ) {
            throw new WorkflowError(
              `Cannot select result path "${resultPath}" for "${resultName}".`,
              {
                code: 'RESULT_SELECTION_FAILED',
                details: { resultName, resultPath },
              },
            );
          }
          value = (value as Record<string, unknown>)[key];
        }
        // The last completed producer wins, including lifecycle steps and
        // retry attempts. Failed attempts remain visible in their own records.
        outputs.set(resultName, value);
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length)
      throw new AggregateError(errors, 'Step result collection failed');
  };
  const runtime = createDocumentRuntime(document, {
    documentSetup: options.documentSetup,
    documentAttemptIndex: options.documentAttemptIndex,
    resolveNode: options.resolveNode,
    project: options.project,
    projectContext: options.projectContext,
    signal,
    defaultTimeoutMs: options.defaultTimeoutMs,
    onStepStart: options.onStepStart,
    onStepResult,
    onResult: async (result) => {
      result.outputs = Object.freeze(Object.fromEntries(outputs));
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
  let stoppedByCase = false;

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
          stoppedByCase ||
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
                : stoppedByCase
                  ? 'bail'
                  : (options.stopReason?.() ?? 'interrupted'),
          );
          cases.push(outcome);
          await options.onCaseOutcome?.(outcome);
          continue;
        }

        await options.onCaseStart?.(collectedCase);
        const attempts = [];
        for (let attemptIndex = 0; attemptIndex <= retry; attemptIndex += 1) {
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
            onStepStart: options.onStepStart,
            onStepResult,
            onResult: options.onCaseResult,
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
          if (attemptFailure) {
            cases.push({
              caseId: collectedCase.caseId,
              projectName,
              name: collectedCase.definition.name,
              sourcePath: collectedCase.sourcePath,
              caseIndex: collectedCase.caseIndex,
              status: 'failed',
              run,
              attempts,
            });
            throw attemptFailure;
          }
          fatalError = options.isFatalError?.(run) ?? false;
          if (
            run.status === 'success' ||
            // Retrying cannot repair cleanup/report publication and would
            // replay actions that may already have completed successfully.
            !!run.teardownErrors?.length ||
            fatalError ||
            signal.aborted ||
            options.shouldStop?.()
          )
            break;
        }
        const run = attempts.at(-1)!;
        const outcome: CaseRunOutcome = {
          caseId: collectedCase.caseId,
          projectName,
          name: collectedCase.definition.name,
          sourcePath: collectedCase.sourcePath,
          caseIndex: collectedCase.caseIndex,
          status: run.status,
          run,
          attempts,
        };
        cases.push(outcome);
        stoppedByCase =
          outcome.status === 'failed' &&
          collectedCase.definition.onFailure === 'stop-document';
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
  documentResult.outputs = Object.freeze(Object.fromEntries(outputs));
  if (executionErrors.length) {
    const completed = new Set(cases.map((outcome) => outcome.caseId));
    cases.push(
      ...document.cases
        .filter((item) => !completed.has(item.caseId))
        .map((item) => asNotRun(item, projectName, 'interrupted')),
    );
    documentResult.status = 'failed';
    documentResult.executionErrors = executionErrors.map(asExecutionError);
    throw new WorkflowExecutionFailure(
      { document: documentResult, cases },
      executionErrors,
    );
  }
  return { document: documentResult, cases };
}
