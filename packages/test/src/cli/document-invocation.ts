import {
  WorkflowExecutionFailure,
  type WorkflowExecutionRecord,
  runDocumentAttempts,
} from '@midscene/core/internal/test-runner';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  CaseRunOutcome,
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentExecutionResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import { isFatalDeviceError } from '../errors';
import type { CollectedWorkflowDocument } from '../parser/types';
import type { CreateYamlPlayerOptions } from '../runtime/create-yaml-player';
import type { YamlBatchBrowserSession } from '../runtime/legacy-browser';
import type { LegacyTestRunPlan } from '../runtime/legacy-config';
import {
  type LegacyWorkflow,
  type LegacyWorkflowExecutionResult,
  runLegacyWorkflow,
} from './legacy-workflow';
import {
  writeCaseAttemptResult,
  writeWorkflowDocumentResult,
} from './result-store';
import type { LoadedExecutionProject, LoadedTestProject } from './test-project';
import type { TestProjectCaseRunResult } from './types';

/** Parser-specific data attached before the scheduler starts. */
export type PreparedDocumentInvocation =
  | {
      kind: 'native';
      document: CollectedWorkflowDocument;
    }
  | {
      kind: 'legacy';
      document: CollectedWorkflowDocument;
      workflow: LegacyWorkflow;
    };

export type LegacyInvocationArtifacts =
  LegacyWorkflowExecutionResult['artifacts'];

interface DocumentInvocationSinks {
  cases: TestProjectCaseRunResult[];
  documents: WorkflowDocumentRunResult[];
  executionRecords: WorkflowExecutionRecord[];
  legacyArtifacts: Map<string, LegacyInvocationArtifacts>;
}

interface ExecuteDocumentInvocationOptions {
  invocation: PreparedDocumentInvocation;
  project: LoadedExecutionProject<unknown>;
  definition: Pick<
    LoadedTestProject<unknown>,
    'test' | 'hasExplicitTestTimeout'
  >;
  projectContext: unknown;
  runDir: string;
  signal: AbortSignal;
  rootSignal: AbortSignal;
  legacyPlan?: LegacyTestRunPlan;
  batchBrowser?: YamlBatchBrowserSession;
  getLegacyPlayerOptions?():
    | CreateYamlPlayerOptions
    | Promise<CreateYamlPlayerOptions>;
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

const latestById = <T>(items: readonly T[], id: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [id(item), item])).values(),
];

async function executeLegacyInvocation(
  options: ExecuteDocumentInvocationOptions & {
    invocation: Extract<PreparedDocumentInvocation, { kind: 'legacy' }>;
  },
): Promise<void> {
  const { invocation, project, sinks } = options;
  const { document, workflow } = invocation;
  const legacyErrors: unknown[] = [];
  const playerOptions = options.legacyPlan
    ? {
        headed: options.legacyPlan.headed,
        keepWindow: options.legacyPlan.keepWindow,
        ...options.batchBrowser?.options,
      }
    : await options.getLegacyPlayerOptions?.();
  const execution = await runLegacyWorkflow(workflow, {
    playerOptions,
    ...(options.legacyPlan?.setup === workflow.source.absolutePath
      ? {
          beforeAttempt: async (attemptIndex: number) => {
            if (attemptIndex > 0) await options.batchBrowser?.reset();
            return {
              headed: options.legacyPlan!.headed,
              keepWindow: options.legacyPlan!.keepWindow,
              ...options.batchBrowser?.options,
            };
          },
        }
      : {}),
    project,
    runDir: options.runDir,
    signal: options.signal,
    defaultTimeoutMs: options.definition.hasExplicitTestTimeout
      ? options.definition.test.testTimeout
      : undefined,
    // Legacy batch bail stops admitting new files. A dispatched file owns its
    // full retry sequence; native projects stop their document retry loop.
    shouldStop: () =>
      (!options.legacyPlan && options.shouldBail()) || options.isProjectFatal(),
    onProgress: options.onProgress,
    onDocumentResult: options.onDocumentResult,
  }).catch((error: unknown) => {
    if (error instanceof WorkflowExecutionFailure) {
      const partial = error.result as LegacyWorkflowExecutionResult;
      legacyErrors.push(...error.errors);
      return partial;
    }
    throw error;
  });

  if (!execution) {
    sinks.cases.push(
      ...document.cases.map((item) => ({
        documentId: document.documentId,
        caseId: item.caseId,
        projectName: project.name,
        name: item.definition.name,
        sourcePath: item.sourcePath,
        caseIndex: item.caseIndex,
        status: 'not-run' as const,
        notRunReason: 'interrupted' as const,
      })),
    );
    return;
  }

  sinks.cases.push(...execution.cases);
  sinks.documents.push(...execution.documents);
  sinks.executionRecords.push(...execution.records);
  sinks.legacyArtifacts.set(document.documentId, execution.artifacts);
  for (const outcome of execution.cases) {
    for (const attempt of outcome.attempts ?? []) {
      try {
        await writeCaseAttemptResult(
          options.runDir,
          project.projectId,
          document.documentId,
          attempt,
        );
      } catch (error) {
        legacyErrors.push(error);
      }
    }
  }
  for (const result of execution.documents) {
    try {
      await writeWorkflowDocumentResult(options.runDir, result);
    } catch (error) {
      legacyErrors.push(error);
    }
  }
  if (legacyErrors.length)
    throw new WorkflowExecutionFailure(execution, legacyErrors);

  const finalCases = latestById(execution.cases, (item) => item.caseId);
  const failedCases = finalCases.filter(
    (item) => item.status === 'failed',
  ).length;
  options.addFailedCases(
    options.legacyPlan && execution.documents.at(-1)?.status === 'failed'
      ? Math.max(1, failedCases)
      : failedCases,
  );
  if (
    finalCases.some(caseHasFatalError) ||
    documentHasFatalError(execution.documents.at(-1)!)
  )
    options.markProjectFatal();
}

async function executeNativeInvocation(
  options: ExecuteDocumentInvocationOptions & {
    invocation: Extract<PreparedDocumentInvocation, { kind: 'native' }>;
  },
): Promise<void> {
  const { document } = options.invocation;
  const { project, sinks } = options;
  const documentRetry = project.retryScope === 'document';
  await runDocumentAttempts(
    {
      retry: documentRetry ? project.retry : 0,
      signal: options.signal,
      shouldStop: () => options.shouldBail() || options.isProjectFatal(),
    },
    async (documentAttemptIndex) => {
      const execution = await runWorkflowDocument(document, {
        documentAttemptIndex: documentRetry ? documentAttemptIndex : undefined,
        resolveNode: project.nodes.require.bind(project.nodes),
        project,
        projectContext: options.projectContext,
        documentSetup: project.documentSetup,
        retry: documentRetry ? 0 : project.retry,
        signal: options.signal,
        defaultTimeoutMs: options.definition.test.testTimeout,
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
        onStepResult: (info, result) =>
          options.onProgress(formatStepResult(info, result)),
        onCaseResult: async (attempt) => {
          await writeCaseAttemptResult(
            options.runDir,
            project.projectId,
            document.documentId,
            attempt,
          );
          options.onProgress(
            `    ${attempt.status === 'success' ? '✓' : '✗'} attempt ${attempt.attemptIndex + 1}/${project.retry + 1}: ${attempt.name} (${attempt.durationMs} ms)`,
          );
        },
        onCaseOutcome: (outcome) => {
          if (!documentRetry && outcome.status === 'failed')
            options.addFailedCases(1);
          if (caseHasFatalError(outcome)) options.markProjectFatal();
        },
        onDocumentResult: options.onDocumentResult,
      }).catch(async (error: unknown) => {
        if (error instanceof WorkflowExecutionFailure) {
          const partial = error.result as WorkflowDocumentExecutionResult;
          sinks.documents.push(partial.document);
          sinks.cases.push(
            ...partial.cases.map((outcome) => ({
              ...outcome,
              documentId: document.documentId,
              documentRunId: partial.document.documentRunId,
            })),
          );
          try {
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

      sinks.cases.push(
        ...execution.cases.map((outcome) => ({
          ...outcome,
          documentId: document.documentId,
          documentRunId: execution.document.documentRunId,
        })),
      );
      if (documentHasFatalError(execution.document)) options.markProjectFatal();
      sinks.documents.push(execution.document);
      await writeWorkflowDocumentResult(options.runDir, execution.document);
      const cleanupErrors = [
        ...(execution.document.teardownErrors ?? []),
        ...execution.cases.flatMap((outcome) =>
          (outcome.attempts ?? []).flatMap(
            (attempt) => attempt.teardownErrors ?? [],
          ),
        ),
      ];
      if (cleanupErrors.length)
        throw new WorkflowExecutionFailure(execution, cleanupErrors);
      const failed =
        execution.document.status === 'failed' ||
        execution.cases.some((item) => item.status !== 'success');
      if (
        documentRetry &&
        (documentAttemptIndex === project.retry || options.isProjectFatal())
      ) {
        options.addFailedCases(
          execution.cases.filter((item) => item.status === 'failed').length +
            (execution.document.status === 'failed' ? 1 : 0),
        );
      }
      return failed ? 'failed' : 'success';
    },
  );
}

/** Execute one prepared document through a parser-neutral scheduler boundary. */
export async function executeDocumentInvocation(
  options: ExecuteDocumentInvocationOptions,
): Promise<void> {
  if (options.invocation.kind === 'legacy')
    return executeLegacyInvocation({
      ...options,
      invocation: options.invocation,
    });
  return executeNativeInvocation({
    ...options,
    invocation: options.invocation,
  });
}
