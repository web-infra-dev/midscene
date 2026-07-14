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
  reason: NonNullable<CaseRunOutcome['notRunReason']>,
): CaseRunOutcome => ({
  caseId: collectedCase.caseId,
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
  const runtime = createDocumentRuntime(document, {
    resolveNode: options.resolveNode,
    setupDocument: options.setupDocument,
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

  try {
    runtimeStarted = true;
    await runtime.start();

    if (!runtime.canRunCases) {
      cases.push(
        ...document.cases.map((collectedCase) =>
          asNotRun(collectedCase, 'document-start-failed'),
        ),
      );
    } else {
      for (const collectedCase of document.cases) {
        if (options.shouldStop?.()) {
          cases.push(asNotRun(collectedCase, 'interrupted'));
          continue;
        }
        await options.onCaseStart?.(collectedCase);
        const run = await runCollectedCase(collectedCase, {
          resolveNode: options.resolveNode,
          beforeEach: document.lifecycle.beforeEach,
          afterEach: document.lifecycle.afterEach,
          context: runtime.context,
          onStepStart: options.onStepStart,
          onStepResult: options.onStepResult,
          onResult: options.onCaseResult,
          createRunId: createCaseRunId
            ? () => createCaseRunId(collectedCase)
            : undefined,
        });
        cases.push({
          caseId: collectedCase.caseId,
          name: collectedCase.definition.name,
          sourcePath: collectedCase.sourcePath,
          caseIndex: collectedCase.caseIndex,
          status: run.status,
          run,
        });
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
