import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createProjectRuntime } from '../engine/project-runtime';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  CaseRunOutcome,
  CaseRunResult,
  ProjectRuntimeResult,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import { WorkflowError, isFatalDeviceError } from '../errors';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  asNotRun,
  buildProjectResult,
  formatStep,
  formatStepResult,
} from './execution-result';
import {
  writeCaseAttemptResult,
  writeWorkflowDocumentResult,
} from './result-store';
import { runTaskPool } from './task-scheduler';
import {
  type TestCaseTask,
  type TestCaseTaskRunResult,
  type TestExecutor,
  type TestExecutorCaseAttemptDto,
  type TestExecutorDocumentResultDto,
  TestExecutorError,
  type TestExecutorErrorDto,
  type TestExecutorLifecycleResultDto,
  type TestExecutorStepResultDto,
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

type CompletedCaseTaskResult = {
  readonly case: TestProjectCaseRunResult;
  readonly document?: WorkflowDocumentRunResult;
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

const reviveError = (error: TestExecutorErrorDto): WorkflowError => {
  const revived = new WorkflowError(error.message, {
    code: error.code,
    details: error.details,
  });
  revived.name = error.name;
  return revived;
};

const reviveStep = (step: TestExecutorStepResultDto): StepRunResult => {
  const { error, output, report, ...base } = step;
  return {
    ...base,
    input: step.input,
    meta: { ...step.meta },
    ...(output ? { output: { ...output } } : {}),
    ...(error ? { error: reviveError(error) } : {}),
    ...(report
      ? { report: { traces: report.traces.map((trace) => ({ ...trace })) } }
      : {}),
  };
};

const reviveAttempt = (
  attempt: TestExecutorCaseAttemptDto,
  resolveReportReference: (reference: string) => string,
): CaseRunResult => {
  const { teardownErrors, reportRefs, beforeEach, steps, afterEach, ...base } =
    attempt;
  return {
    ...base,
    beforeEach: beforeEach.map(reviveStep),
    steps: steps.map(reviveStep),
    afterEach: afterEach.map(reviveStep),
    ...(teardownErrors
      ? { teardownErrors: teardownErrors.map(reviveError) }
      : {}),
    ...(reportRefs
      ? { reportPaths: reportRefs.map(resolveReportReference) }
      : {}),
  };
};

const reviveDocument = (
  document: TestExecutorDocumentResultDto,
  resolveReportReference: (reference: string) => string,
): WorkflowDocumentRunResult => {
  const { teardownErrors, reportRefs, beforeAll, afterAll, ...base } = document;
  return {
    ...base,
    beforeAll: beforeAll.map(reviveStep),
    afterAll: afterAll.map(reviveStep),
    ...(teardownErrors
      ? { teardownErrors: teardownErrors.map(reviveError) }
      : {}),
    ...(reportRefs
      ? { reportPaths: reportRefs.map(resolveReportReference) }
      : {}),
  };
};

const reviveLifecycle = (
  lifecycle: TestExecutorLifecycleResultDto,
): ProjectRuntimeResult => {
  const { setupError, teardownErrors, ...base } = lifecycle;
  return {
    ...base,
    ...(setupError ? { setupError: reviveError(setupError) } : {}),
    ...(teardownErrors
      ? { teardownErrors: teardownErrors.map(reviveError) }
      : {}),
  };
};

const toTransportResult = (
  result: {
    case: CaseRunOutcome & { documentId: string };
    document?: WorkflowDocumentRunResult;
    lifecycle?: ProjectRuntimeResult;
  },
  materializeReport: (sourcePath: string) => string,
): TestCaseTaskRunResult => {
  const mapAttempt = (attempt: CaseRunResult) => {
    const { reportPaths, ...transportAttempt } = attempt;
    return {
      ...transportAttempt,
      ...(reportPaths?.length
        ? { reportRefs: reportPaths.map(materializeReport) }
        : {}),
    };
  };
  const attempts = result.case.attempts?.map(mapAttempt);
  const run = attempts?.at(-1);
  const { run: _run, attempts: _attempts, ...transportCase } = result.case;
  const document = result.document
    ? (() => {
        const { reportPaths, ...transportDocument } = result.document;
        return {
          ...transportDocument,
          ...(reportPaths?.length
            ? { reportRefs: reportPaths.map(materializeReport) }
            : {}),
        };
      })()
    : undefined;
  return JSON.parse(
    JSON.stringify({
      case: {
        ...transportCase,
        ...(run ? { run } : {}),
        ...(attempts ? { attempts } : {}),
      },
      ...(document ? { document } : {}),
      ...(result.lifecycle ? { lifecycle: result.lifecycle } : {}),
    }),
  ) as TestCaseTaskRunResult;
};

const fromTransportResult = (
  result: TestCaseTaskRunResult,
  resolveReportReference: (reference: string) => string,
): {
  case: TestProjectCaseRunResult;
  document?: WorkflowDocumentRunResult;
  lifecycle?: ProjectRuntimeResult;
} => {
  const attempts = result.case.attempts?.map((attempt) =>
    reviveAttempt(attempt, resolveReportReference),
  );
  const run = attempts?.at(-1);
  const { run: _run, attempts: _attempts, ...caseBase } = result.case;
  return {
    case: {
      ...caseBase,
      ...(run ? { run } : {}),
      ...(attempts ? { attempts } : {}),
    },
    ...(result.document
      ? { document: reviveDocument(result.document, resolveReportReference) }
      : {}),
    ...(result.lifecycle
      ? { lifecycle: reviveLifecycle(result.lifecycle) }
      : {}),
  };
};

const runLocalCase = async <TProjectContext>(
  preparedTask: PreparedCaseTask<TProjectContext>,
  options: RunCaseExecutionOptions<TProjectContext>,
  taskProgress: (message: string) => void,
  materializeReport: (sourcePath: string) => string,
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
  let lifecycle: ProjectRuntimeResult;
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
    return toTransportResult(
      {
        case: asNotRun(
          task.documentId,
          collectedCase,
          project.name,
          options.signal.aborted ? 'interrupted' : 'project-setup-failed',
        ),
        lifecycle,
      },
      materializeReport,
    );
  }
  const outcome = execution.cases[0];
  if (!outcome) {
    throw new Error(`Executor did not produce case result for ${task.caseId}.`);
  }
  return toTransportResult(
    {
      case: { ...outcome, documentId: task.documentId },
      document: execution.document,
      lifecycle,
    },
    materializeReport,
  );
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

  const outputDir = join(
    options.runDir,
    task.projectId,
    'executor-output',
    task.documentId,
    task.caseId,
  );
  mkdirSync(outputDir, { recursive: true });
  const materializedReportByReference = new Map<string, string>();
  const materializeReport = (sourcePath: string): string => {
    const resolvedSource = realpathSync(sourcePath);
    const sourceStat = statSync(resolvedSource);
    if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
      throw new TestExecutorError(
        `Executor report must be a regular file or directory: ${sourcePath}`,
        { kind: 'report' },
      );
    }
    const reference = randomUUID();
    const destination = join(
      outputDir,
      'reports',
      `${reference}${sourceStat.isFile() ? extname(resolvedSource) : ''}`,
    );
    mkdirSync(join(outputDir, 'reports'), { recursive: true });
    cpSync(resolvedSource, destination, {
      recursive: sourceStat.isDirectory(),
    });
    materializedReportByReference.set(reference, destination);
    return reference;
  };
  const resolveReportReference = (reference: string): string => {
    const reportPath = materializedReportByReference.get(reference);
    if (!reportPath) {
      throw new TestExecutorError(
        `Executor returned unknown report reference ${reference}.`,
        { kind: 'report' },
      );
    }
    return reportPath;
  };

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
        outputDir,
        materializeReport,
        runLocal: () =>
          runLocalCase(preparedTask, options, taskProgress, materializeReport),
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
  const internalResult = fromTransportResult(result, resolveReportReference);
  for (const attempt of internalResult.case.attempts ?? []) {
    writeCaseAttemptResult(
      options.runDir,
      task.projectId,
      task.documentId,
      attempt,
    );
  }
  if (internalResult.document) {
    writeWorkflowDocumentResult(options.runDir, internalResult.document);
  }
  taskProgress(internalResult.case.status);
  return {
    ...internalResult,
    case: {
      ...internalResult.case,
      execution: {
        executor: executor.name,
        resources: task.resources,
        attempts: executorAttempts,
        ...(internalResult.lifecycle
          ? { lifecycle: internalResult.lifecycle }
          : {}),
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
