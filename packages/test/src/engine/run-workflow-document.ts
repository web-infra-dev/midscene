import type { CollectedCase, CollectedWorkflowDocument } from '../parser/types';
import { createDocumentRuntime } from './document-runtime';
import { runCollectedCase } from './run-collected-case';
import type {
  CaseRunOutcome,
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
  status: 'not-run',
  notRunReason: reason,
});

export async function runWorkflowDocument<TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: RunWorkflowDocumentOptions<TContext>,
): Promise<WorkflowDocumentExecutionResult> {
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
    resolveNode: options.resolveNode,
    project: options.project,
    projectContext: options.projectContext,
    signal: options.signal,
    defaultTimeoutMs: options.defaultTimeoutMs,
    onStepStart: options.onStepStart,
    onStepResult: options.onStepResult,
    onResult: options.onDocumentResult,
    createDocumentRunId: createDocumentRunId
      ? () => createDocumentRunId(document)
      : undefined,
  });
  const cases: CaseRunOutcome[] = [];
  let runtimeStarted = false;
  let documentResult: WorkflowDocumentRunResult | undefined;
  let executionError: unknown;
  let fatalError = false;

  try {
    runtimeStarted = true;
    await runtime.start();

    if (!runtime.canRunCases) {
      const reason = options.signal?.aborted
        ? (options.stopReason?.() ?? 'interrupted')
        : 'document-start-failed';
      cases.push(
        ...document.cases.map((collectedCase) =>
          asNotRun(collectedCase, projectName, reason),
        ),
      );
    } else {
      for (const collectedCase of document.cases) {
        if (fatalError || options.shouldStop?.()) {
          const outcome = asNotRun(
            collectedCase,
            projectName,
            fatalError
              ? 'fatal-error'
              : (options.stopReason?.() ?? 'interrupted'),
          );
          cases.push(outcome);
          await options.onCaseOutcome?.(outcome);
          continue;
        }

        await options.onCaseStart?.(collectedCase);
        const attempts = [];
        for (let attemptIndex = 0; attemptIndex <= retry; attemptIndex += 1) {
          const run = await runCollectedCase(collectedCase, {
            resolveNode: options.resolveNode,
            beforeEach: document.lifecycle.beforeEach,
            afterEach: document.lifecycle.afterEach,
            context: runtime.context,
            projectName,
            attemptIndex,
            documentHistory: runtime.history,
            signal: options.signal,
            defaultTimeoutMs: options.defaultTimeoutMs,
            onStepStart: options.onStepStart,
            onStepResult: options.onStepResult,
            onResult: options.onCaseResult,
            createRunId: createCaseRunId
              ? () => createCaseRunId(collectedCase, attemptIndex)
              : undefined,
          });
          attempts.push(run);
          fatalError = options.isFatalError?.(run) ?? false;
          if (run.status === 'success' || fatalError) break;
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
        await options.onCaseOutcome?.(outcome);
      }
    }
  } catch (error) {
    executionError = error;
  } finally {
    if (runtimeStarted) {
      try {
        documentResult = await runtime.finish();
      } catch (error) {
        executionError ??= error;
      }
    }
  }

  if (executionError) throw executionError;
  if (!documentResult) {
    throw new Error(
      `Workflow document "${document.sourcePath}" did not produce a result.`,
    );
  }
  return { document: documentResult, cases };
}
