import { createProjectRuntime } from '../engine/project-runtime';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import { isFatalDeviceError } from '../errors';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  writeCaseAttemptResult,
  writeWorkflowDocumentResult,
} from './result-store';
import { runTaskPool } from './task-scheduler';
import {
  type TestCaseTask,
  type TestCaseTaskRunResult,
  type TestExecutor,
  TestExecutorError,
  assertTestCaseTaskRunResult,
  localTestExecutor,
} from './test-executor';
import type {
  LoadedExecutionProject,
  ResolvedTestOptions,
  TestFileSelection,
} from './test-project';
import type {
  TestExecutionProjectRunResult,
  TestProjectCaseRunResult,
  TestProjectCollectionError,
} from './types';

export interface PreparedCaseExecutionProject<TProjectContext = unknown> {
  project: LoadedExecutionProject<TProjectContext>;
  fileSelection: TestFileSelection;
  sources: readonly WorkflowDocumentSource[];
  documents: readonly CollectedWorkflowDocument[];
  collectionErrors: readonly TestProjectCollectionError[];
  selectedCaseCount: number;
  filteredCaseCount: number;
  availableCaseIds: readonly string[];
}

interface PreparedCaseTask<TProjectContext = unknown> {
  readonly task: TestCaseTask;
  readonly projectIndex: number;
  readonly prepared: PreparedCaseExecutionProject<TProjectContext>;
  readonly document: CollectedWorkflowDocument;
  readonly collectedCase: CollectedCase;
}

type CompletedCaseTaskResult = TestCaseTaskRunResult & {
  readonly case: TestProjectCaseRunResult;
};

export interface RunCaseExecutionOptions<TProjectContext = unknown> {
  readonly projects: readonly PreparedCaseExecutionProject<TProjectContext>[];
  readonly test: ResolvedTestOptions;
  readonly executor?: TestExecutor;
  readonly runDir: string;
  readonly signal: AbortSignal;
  readonly progress: (message: string) => void;
  readonly onInfrastructureError: (error: unknown) => void;
}

const asNotRun = (
  documentId: string,
  collectedCase: CollectedCase,
  projectName: string,
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult => ({
  documentId,
  caseId: collectedCase.caseId,
  projectName,
  name: collectedCase.definition.name,
  sourcePath: collectedCase.sourcePath,
  caseIndex: collectedCase.caseIndex,
  status: 'not-run',
  notRunReason: reason,
});

const formatStep = (info: StepExecutionInfo): string => {
  const position = info.scope === 'case' ? info.case : info.document;
  const phase = position.phase === 'steps' ? 'step' : position.phase;
  return `${phase} ${position.stepIndex + 1}/${info.stepCount}: ${info.node}`;
};

const formatStepResult = (
  info: StepExecutionInfo,
  result: StepRunResult,
): string => {
  const symbol = result.status === 'success' ? '✓' : '✗';
  const error = result.error ? ` — ${result.error.message}` : '';
  const continuation = result.continuedAfterError ? '; continuing' : '';
  return `${symbol} ${formatStep(info)} (${result.durationMs} ms)${error}${continuation}`;
};

const isolatedDocumentId = (
  document: CollectedWorkflowDocument,
  collectedCase: CollectedCase,
): string => `${document.documentId}-case-${collectedCase.caseIndex}`;

const prepareCaseTasks = <TProjectContext>(
  projects: readonly PreparedCaseExecutionProject<TProjectContext>[],
): readonly PreparedCaseTask<TProjectContext>[] =>
  projects.flatMap((prepared, projectIndex) =>
    prepared.documents.flatMap((document) =>
      document.cases.map((collectedCase) => {
        const documentId = isolatedDocumentId(document, collectedCase);
        return {
          projectIndex,
          prepared,
          document,
          collectedCase,
          task: Object.freeze({
            taskId: `${prepared.project.projectId}:${collectedCase.caseId}`,
            projectId: prepared.project.projectId,
            projectName: prepared.project.name,
            documentId,
            sourcePath: collectedCase.sourcePath,
            caseId: collectedCase.caseId,
            caseName: collectedCase.definition.name,
            caseIndex: collectedCase.caseIndex,
            tags: Object.freeze([...(collectedCase.definition.tags ?? [])]),
            resources: Object.freeze([
              ...(collectedCase.definition.resources ?? []),
            ]),
            retry: prepared.project.retry,
          }),
        };
      }),
    ),
  );

const buildProjectResult = (
  prepared: PreparedCaseExecutionProject,
  cases: readonly TestProjectCaseRunResult[],
  documents: readonly WorkflowDocumentRunResult[],
): TestExecutionProjectRunResult => {
  const { project } = prepared;
  const projectFailed =
    prepared.collectionErrors.length > 0 ||
    cases.some((item) => item.status !== 'success') ||
    documents.some((item) => item.status === 'failed');
  return {
    projectId: project.projectId,
    name: project.name,
    status: projectFailed ? 'failed' : 'success',
    retry: project.retry,
    fileSelection: prepared.fileSelection,
    tagSelection: project.tags,
    sourceCount: prepared.sources.length,
    selectedCaseCount: prepared.selectedCaseCount,
    filteredCaseCount: prepared.filteredCaseCount,
    cases,
    documents,
    collectionErrors: prepared.collectionErrors,
  };
};

const runLocalCase = async <TProjectContext>(
  preparedTask: PreparedCaseTask<TProjectContext>,
  options: RunCaseExecutionOptions<TProjectContext>,
  taskProgress: (message: string) => void,
): Promise<TestCaseTaskRunResult> => {
  const { prepared, document, collectedCase, task } = preparedTask;
  const { project } = prepared;
  const isolatedDocument: CollectedWorkflowDocument = {
    ...document,
    documentId: task.documentId,
    cases: [collectedCase],
  };
  const runtime = createProjectRuntime({
    project,
    setup: project.setup,
    signal: options.signal,
  });
  let lifecycle: TestCaseTaskRunResult['lifecycle'];
  let execution: Awaited<ReturnType<typeof runWorkflowDocument>> | undefined;
  let executionError: unknown;

  try {
    await runtime.start();
    if (runtime.canRun) {
      execution = await runWorkflowDocument(isolatedDocument, {
        resolveNode: project.nodes.require.bind(project.nodes),
        project,
        projectContext: runtime.context,
        retry: project.retry,
        signal: runtime.signal,
        defaultTimeoutMs: options.test.testTimeout,
        shouldStop: () => options.signal.aborted,
        stopReason: () => 'interrupted',
        isFatalError: (run) =>
          [...run.beforeEach, ...run.steps, ...run.afterEach].some(
            (step) => step.error && isFatalDeviceError(step.error),
          ) || (run.teardownErrors ?? []).some(isFatalDeviceError),
        onStepStart: (info) => taskProgress(`→ ${formatStep(info)}`),
        onStepResult: (info, result) =>
          taskProgress(formatStepResult(info, result)),
        onCaseResult: (attempt) =>
          taskProgress(
            `${attempt.status === 'success' ? '✓' : '✗'} attempt ${attempt.attemptIndex + 1}/${project.retry + 1}: ${attempt.name} (${attempt.durationMs} ms)`,
          ),
      });
    }
  } catch (error) {
    executionError = error;
  } finally {
    const failed =
      executionError !== undefined ||
      !runtime.canRun ||
      execution?.cases[0]?.status !== 'success' ||
      execution?.document.status === 'failed';
    lifecycle = await runtime.finish(failed ? 'failed' : 'success');
  }

  if (executionError) throw executionError;
  if (!execution) {
    return {
      case: asNotRun(
        task.documentId,
        collectedCase,
        project.name,
        options.signal.aborted ? 'interrupted' : 'project-setup-failed',
      ),
      lifecycle,
    };
  }
  const outcome = execution.cases[0];
  if (!outcome) {
    throw new Error(`Executor did not produce case result for ${task.caseId}.`);
  }
  return {
    case: { ...outcome, documentId: task.documentId },
    document: execution.document,
    lifecycle,
  };
};

const runCaseTask = async <TProjectContext>(
  preparedTask: PreparedCaseTask<TProjectContext>,
  taskIndex: number,
  taskCount: number,
  options: RunCaseExecutionOptions<TProjectContext>,
): Promise<CompletedCaseTaskResult> => {
  const { prepared, task } = preparedTask;
  const taskProgress = (message: string) =>
    options.progress(
      `[case ${taskIndex + 1}/${taskCount}] ${task.projectName} / ${task.sourcePath} / ${task.caseName}: ${message}`,
    );
  taskProgress('started');

  if (prepared.collectionErrors.length > 0) {
    return {
      case: asNotRun(
        task.documentId,
        preparedTask.collectedCase,
        task.projectName,
        'project-preflight-failed',
      ),
    };
  }
  const executor = options.executor ?? localTestExecutor;
  let result: TestCaseTaskRunResult | undefined;
  let executorFailure: TestExecutorError | undefined;
  let executorAttempts = 0;
  for (
    let attemptIndex = 0;
    attemptIndex <= options.test.executorRetry;
    attemptIndex += 1
  ) {
    executorAttempts = attemptIndex + 1;
    try {
      result = await executor.execute(task, {
        signal: options.signal,
        onProgress: taskProgress,
        runLocal: () => runLocalCase(preparedTask, options, taskProgress),
      });
      executorFailure = undefined;
      break;
    } catch (error) {
      if (!(error instanceof TestExecutorError)) throw error;
      executorFailure = error;
      if (
        !error.retryable ||
        attemptIndex >= options.test.executorRetry ||
        options.signal.aborted
      ) {
        break;
      }
      taskProgress(
        `executor retry ${attemptIndex + 1}/${options.test.executorRetry}: ${error.message}`,
      );
    }
  }
  if (!result) {
    if (!executorFailure) {
      throw new Error(`Executor did not return a result for ${task.caseId}.`);
    }
    taskProgress(`executor-failed: ${executorFailure.message}`);
    return {
      case: {
        ...asNotRun(
          task.documentId,
          preparedTask.collectedCase,
          task.projectName,
          'executor-failed',
        ),
        execution: {
          executor: executor.name,
          resources: task.resources,
          attempts: executorAttempts,
          failure: {
            kind: executorFailure.kind,
            message: executorFailure.message,
            retryable: executorFailure.retryable,
          },
        },
      },
    };
  }
  assertTestCaseTaskRunResult(task, result);
  for (const attempt of result.case.attempts ?? []) {
    writeCaseAttemptResult(
      options.runDir,
      task.projectId,
      task.documentId,
      attempt,
    );
  }
  if (result.document) {
    writeWorkflowDocumentResult(options.runDir, result.document);
  }
  taskProgress(result.case.status);
  return {
    ...result,
    case: {
      ...result.case,
      execution: {
        executor: executor.name,
        resources: task.resources,
        attempts: executorAttempts,
        ...(result.lifecycle ? { lifecycle: result.lifecycle } : {}),
        ...(result.artifacts ? { artifacts: result.artifacts } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
      },
    },
  };
};

export const runCaseExecution = async <TProjectContext>(
  options: RunCaseExecutionOptions<TProjectContext>,
): Promise<readonly TestExecutionProjectRunResult[]> => {
  const tasks = prepareCaseTasks(options.projects);
  let failedCaseCount = 0;
  const bailReached = () =>
    options.test.bail > 0 && failedCaseCount >= options.test.bail;
  const results =
    tasks.length === 0
      ? []
      : await runTaskPool({
          tasks: tasks.map((preparedTask) => preparedTask.task),
          maxConcurrency: Math.min(options.test.maxConcurrency, tasks.length),
          signal: options.signal,
          shouldStop: bailReached,
          run: async (_task, taskIndex) => {
            try {
              const result = await runCaseTask(
                tasks[taskIndex],
                taskIndex,
                tasks.length,
                options,
              );
              if (result.case.status === 'failed') failedCaseCount += 1;
              return result;
            } catch (error) {
              options.onInfrastructureError(error);
              throw error;
            }
          },
        });

  return options.projects.map((prepared, projectIndex) => {
    const projectTasks = tasks
      .map((task, taskIndex) => ({ task, result: results[taskIndex] }))
      .filter(({ task }) => task.projectIndex === projectIndex);
    const reason = prepared.collectionErrors.length
      ? 'project-preflight-failed'
      : options.signal.aborted
        ? 'interrupted'
        : bailReached()
          ? 'bail'
          : undefined;
    const cases = projectTasks.map(({ task, result }) => {
      if (result) return result.case;
      if (!reason) {
        throw new Error(
          `Case scheduler did not produce a result for "${task.task.caseId}".`,
        );
      }
      return asNotRun(
        task.task.documentId,
        task.collectedCase,
        prepared.project.name,
        reason,
      );
    });
    const documents = projectTasks.flatMap(({ result }) =>
      result?.document ? [result.document] : [],
    );
    return buildProjectResult(prepared, cases, documents);
  });
};
