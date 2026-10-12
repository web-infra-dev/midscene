import {
  WorkflowExecutionFailure,
  decideRetry,
  runDocumentAttempts,
  runWorkflowDocument,
} from '@midscene/core/internal/test-runner';
import type {
  CaseRunOutcome,
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentExecutionResult,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import { isFatalDeviceError } from '../errors';
import type { PreparedDocumentInvocation } from './execution-plan';
import {
  writeCaseAttemptResult,
  writeWorkflowDocumentResult,
} from './result-store';
import type { LoadedExecutionProject } from './test-project';
import type { TestProjectCaseRunResult } from './types';

interface DocumentInvocationSinks {
  cases: TestProjectCaseRunResult[];
  documents: WorkflowDocumentRunResult[];
}

interface ExecuteDocumentInvocationOptions {
  invocation: PreparedDocumentInvocation;
  project: LoadedExecutionProject<unknown>;
  projectContext: unknown;
  runDir: string;
  signal: AbortSignal;
  rootSignal: AbortSignal;
  shouldBail(): boolean;
  isProjectFatal(): boolean;
  markProjectFatal(): void;
  addFailedCases(count: number): void;
  onProgress(message: string): void;
  onDocumentResult?(result: WorkflowDocumentRunResult): Promise<void>;
  sinks: DocumentInvocationSinks;
}

const stepPosition = (info: StepExecutionInfo) =>
  info.scope === 'case' ? info.case : info.document;

const formatStep = (info: StepExecutionInfo): string => {
  const position = stepPosition(info);
  const phase = position.phase === 'steps' ? 'step' : position.phase;
  return `${phase} ${position.stepIndex + 1}/${info.stepCount}: ${info.node}`;
};

const formatStepResult = (
  info: StepExecutionInfo,
  result: StepRunResult,
): string => {
  const indent = info.scope === 'case' ? '      ' : '    ';
  if (result.status === 'not-run')
    return `${indent}– ${formatStep(info)} (not run: ${result.notRunReason})`;
  const symbol = result.status === 'success' ? '✓' : '✗';
  const error = result.error ? ` — ${result.error.message}` : '';
  const continuation = result.continuedAfterError ? '; continuing' : '';
  return `${indent}${symbol} ${formatStep(info)} (${result.durationMs} ms)${error}${continuation}`;
};

const caseHasFatalError = (outcome: CaseRunOutcome): boolean =>
  (outcome.attempts ?? []).some(
    (attempt) =>
      [...attempt.beforeEach, ...attempt.steps, ...attempt.afterEach].some(
        (step) => step.error && isFatalDeviceError(step.error),
      ) || (attempt.teardownErrors ?? []).some(isFatalDeviceError),
  );

const documentHasFatalError = (result: WorkflowDocumentRunResult): boolean =>
  [...result.beforeAll, ...result.afterAll].some(
    (step) => step.error && isFatalDeviceError(step.error),
  ) || (result.teardownErrors ?? []).some(isFatalDeviceError);

/** Execute prepared document policies through the shared retry boundary. */
export async function executeDocumentInvocation(
  options: ExecuteDocumentInvocationOptions,
): Promise<void> {
  const { invocation, project, sinks } = options;
  const { document } = invocation;
  const documentRetry = invocation.retry.scope === 'document';
  const attempts: WorkflowDocumentExecutionResult[] = [];

  await runDocumentAttempts(
    {
      retry: documentRetry ? invocation.retry.count : 0,
      signal: options.signal,
      shouldStop: () => options.shouldBail() || options.isProjectFatal(),
    },
    async (documentAttemptIndex) => {
      if (documentRetry)
        options.onProgress(
          `    file attempt ${documentAttemptIndex + 1}/${invocation.retry.count + 1}: ${document.sourcePath}`,
        );
      const execution = await runWorkflowDocument(document, {
        plan: invocation.plan,
        documentAttemptIndex: documentRetry ? documentAttemptIndex : undefined,
        ...invocation.bindings,
        project,
        projectContext: options.projectContext,
        retry: documentRetry ? 0 : invocation.retry.count,
        signal: options.signal,
        defaultTimeoutMs: invocation.defaultTimeoutMs,
        shouldStop: () =>
          options.rootSignal.aborted ||
          options.shouldBail() ||
          options.isProjectFatal(),
        stopReason: () =>
          options.rootSignal.aborted
            ? 'interrupted'
            : options.isProjectFatal()
              ? 'fatal-error'
              : 'bail',
        isFatalError: (run) =>
          [...run.beforeEach, ...run.steps, ...run.afterEach].some(
            (step) => step.error && isFatalDeviceError(step.error),
          ) || (run.teardownErrors ?? []).some(isFatalDeviceError),
        onCaseStart: (collectedCase) => {
          options.onProgress(
            `    [case ${collectedCase.caseIndex + 1}/${document.cases.length}] ${collectedCase.definition.name}`,
          );
        },
        onStepStart: (info) => {
          const indent = info.scope === 'case' ? '      ' : '    ';
          options.onProgress(`${indent}→ ${formatStep(info)}`);
        },
        onStepResult: async (info, result) => {
          await invocation.bindings.onStepResult?.(info, result);
          options.onProgress(formatStepResult(info, result));
        },
        onCaseResult: async (attempt) => {
          await writeCaseAttemptResult(
            options.runDir,
            project.projectId,
            document.documentId,
            attempt,
          );
          options.onProgress(
            `    ${attempt.status === 'success' ? '✓' : '✗'} attempt ${attempt.attemptIndex + 1}/${documentRetry ? 1 : invocation.retry.count + 1}: ${attempt.name} (${attempt.durationMs} ms)`,
          );
        },
        onCaseOutcome: (outcome) => {
          if (caseHasFatalError(outcome)) options.markProjectFatal();
          if (!documentRetry && outcome.status === 'failed')
            options.addFailedCases(1);
        },
        onDocumentResult: options.onDocumentResult,
      }).catch(async (error: unknown) => {
        if (error instanceof WorkflowExecutionFailure) {
          const partial = error.result as WorkflowDocumentExecutionResult;
          const cleanupOnly =
            error.errors.length > 0 &&
            error.errors.every((failure) =>
              partial.document.hostErrors?.some(
                (host) =>
                  host.phase === 'cleanup' &&
                  (host.error === failure ||
                    (host.error instanceof Error &&
                      host.error.cause === failure)),
              ),
            );
          // Disposal failures belong to this Project. Keep their results and
          // apply the same resource safety checks as Node cleanup below.
          if (cleanupOnly) return partial;
          if (documentRetry)
            partial.document.retryDecision = decideRetry({
              scope: 'document',
              retryCount: invocation.retry.count,
              attemptIndex: documentAttemptIndex,
              status: 'failed',
              infrastructureError: true,
            });
          attempts.push(partial);
          sinks.documents.push(partial.document);
          sinks.cases.push(
            ...partial.cases.map((outcome) => ({
              ...outcome,
              documentId: document.documentId,
              documentRunId: partial.document.documentRunId,
            })),
          );
          try {
            for (const outcome of partial.cases)
              for (const attempt of outcome.attempts ?? [])
                await writeCaseAttemptResult(
                  options.runDir,
                  project.projectId,
                  document.documentId,
                  attempt,
                );
            await writeWorkflowDocumentResult(options.runDir, partial.document);
          } catch (publicationError) {
            throw new WorkflowExecutionFailure(partial, [
              ...error.errors,
              publicationError,
            ]);
          }
        }
        throw error;
      });

      if (documentHasFatalError(execution.document)) options.markProjectFatal();
      const owners = [
        execution.document,
        ...execution.cases.flatMap((outcome) => outcome.attempts ?? []),
      ];
      const cleanupPending = owners.some(
        (owner) => owner.cleanup?.status === 'pending',
      );
      const operationPending = owners.some(
        (owner) => !!owner.pendingOperations?.length,
      );
      const cleanupFailed = owners.some(
        (owner) =>
          owner.cleanup?.status === 'failed' ||
          !!owner.teardownErrors?.length ||
          ('hostErrors' in owner &&
            owner.hostErrors?.some(({ phase }) => phase === 'cleanup')),
      );
      // Files share the Project context; stop reusing it without cancelling
      // independent Projects. Publication and execution errors still throw.
      if (cleanupPending || cleanupFailed || operationPending)
        options.markProjectFatal();
      const failed =
        execution.document.status === 'failed' ||
        execution.cases.some((item) => item.status !== 'success');
      const decision = decideRetry({
        scope: 'document',
        retryCount: invocation.retry.count,
        attemptIndex: documentAttemptIndex,
        status: failed ? 'failed' : 'success',
        cleanupPending,
        cleanupFailed,
        operationPending,
        fatalError: options.isProjectFatal(),
        interrupted: options.signal.aborted || options.rootSignal.aborted,
        shouldStop: options.shouldBail(),
      });
      if (documentRetry) execution.document.retryDecision = decision;
      attempts.push(execution);
      sinks.cases.push(
        ...execution.cases.map((outcome) => ({
          ...outcome,
          documentId: document.documentId,
          documentRunId: execution.document.documentRunId,
        })),
      );
      sinks.documents.push(execution.document);
      // Per-attempt callbacks publish incremental facts; seal the final retry
      // decision after callback-driven interruption/bail has been observed.
      try {
        for (const outcome of execution.cases)
          for (const attempt of outcome.attempts ?? [])
            await writeCaseAttemptResult(
              options.runDir,
              project.projectId,
              document.documentId,
              attempt,
            );
        await writeWorkflowDocumentResult(options.runDir, execution.document);
      } catch (error) {
        execution.document.status = 'failed';
        execution.document.hostErrors = [
          ...(execution.document.hostErrors ?? []),
          { phase: 'publication', error },
        ];
        if (documentRetry)
          execution.document.retryDecision = decideRetry({
            scope: 'document',
            retryCount: invocation.retry.count,
            attemptIndex: documentAttemptIndex,
            status: 'failed',
            infrastructureError: true,
          });
        throw new WorkflowExecutionFailure(execution, [error]);
      }
      return decision.decision === 'retry' ? 'failed' : undefined;
    },
  );

  const final = attempts.at(-1);
  if (!final) return;
  const failedCases = final.cases.filter(
    (item) => item.status === 'failed',
  ).length;
  if (documentRetry && failedCases) options.addFailedCases(failedCases);
  else if (final.document.status === 'failed' && failedCases === 0)
    options.addFailedCases(Math.max(1, failedCases));
}
