import { setMaxListeners } from 'node:events';
import { dirname, join } from 'node:path';
import type { TestRunReportSourceIndex } from '@midscene/core';
import {
  WorkflowExecutionFailure,
  WorkflowPublicationError,
  asExecutionError,
  observeResourceOperations,
  sumTestRunReportMetrics,
} from '@midscene/core/internal/test-runner';
import type {
  CollectedCase,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import {
  TestRunReportAssembler,
  calculateTestRunHealth,
} from '@midscene/core/report';
import { getDebug } from '@midscene/shared/logger';
import { writeTestResultMarkdown } from '../report/result-markdown';
import {
  buildTestRunReportDump,
  collectTestRunReportSources,
} from '../report/test-run-report';
import type {
  PreparedExecutionProject,
  PreparedTestRunPlan,
} from './execution-plan';
import { runPreparedFiles } from './file-scheduler';
import { configuredModelNames } from './model-usage';
import { createOperationJournal } from './operation-journal';
import { writeTestProjectRunResult, writeTestRunPlan } from './result-store';
import type {
  TestExecutionProjectRunResult,
  TestProjectCaseRunResult,
  TestProjectRunResult,
  TestProjectRunSummary,
} from './types';

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

const summarize = (
  projects: readonly TestExecutionProjectRunResult[],
): TestProjectRunSummary => {
  const healthCases = projects.flatMap((project) => {
    const documentAttemptByRunId = new Map(
      project.documents.map((document) => [
        document.documentRunId,
        document.attemptIndex ?? 0,
      ]),
    );
    return latestById(project.cases, (item) => item.caseId).map((item) => {
      return {
        status: item.status,
        ...(item.run ? { run: item.run } : {}),
        ...(item.attempts ? { attempts: item.attempts } : {}),
        retryCount: item.documentRunId
          ? (documentAttemptByRunId.get(item.documentRunId) ?? 0)
          : 0,
      };
    });
  });
  const documents = projects.flatMap((project) =>
    latestById(project.documents, (item) => item.documentId),
  );
  const health = calculateTestRunHealth(healthCases);
  return {
    total: health.total,
    passed: health.passed,
    failed: health.failed,
    notRun: health.notRun,
    passedAfterRetry: health.passedAfterRetry,
    finalPassRate: health.finalPassRate,
    firstPassRate: health.firstPassRate,
    filtered: projects.reduce(
      (total, project) => total + project.filteredCaseCount,
      0,
    ),
    collectionErrors: projects.reduce(
      (total, project) => total + project.collectionErrors.length,
      0,
    ),
    documentFailures: documents.filter(
      (document) => document.status === 'failed',
    ).length,
    projectFailures: projects.filter((project) => project.status === 'failed')
      .length,
  };
};

const latestById = <T>(items: readonly T[], id: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [id(item), item])).values(),
];

const notRunSuite = (
  prepared: PreparedExecutionProject,
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult[] =>
  prepared.documents.flatMap((document) =>
    document.cases.map((item) =>
      asNotRun(document.documentId, item, prepared.project.name, reason),
    ),
  );

/** The executor sees prepared policies and bindings, never source-language rules. */
export async function runPreparedTestProject(
  plan: PreparedTestRunPlan,
): Promise<TestProjectRunResult> {
  const {
    startedAt,
    runId,
    projectRoot,
    configPath,
    resultDir,
    runDir,
    summaryPath,
    reportDir,
    definition,
    projects: preparedProjects,
  } = plan;
  const progress = plan.onProgress;
  const totalDocuments = preparedProjects.reduce(
    (total, prepared) => total + prepared.documents.length,
    0,
  );
  const totalCases = preparedProjects.reduce(
    (total, prepared) => total + prepared.selectedCaseCount,
    0,
  );
  const totalErrors = preparedProjects.reduce(
    (total, prepared) => total + prepared.collectionErrors.length,
    0,
  );
  plan.onEvent?.({
    type: 'run-start',
    configuredModels: configuredModelNames(),
    projects: preparedProjects.length,
    documents: totalDocuments + totalErrors,
    cases: totalCases,
    projectRoot,
    configPath,
    startedAt: startedAt.toISOString(),
    concurrency: Math.min(
      definition.test.maxConcurrentProjects ?? Number.POSITIVE_INFINITY,
      preparedProjects.length,
    ),
    files: preparedProjects.flatMap((prepared) => [
      ...prepared.documents.map((document) => ({
        documentId: document.documentId,
        projectName: prepared.project.name,
        sourcePath: document.sourcePath,
        cases: document.cases.length,
      })),
      ...prepared.collectionErrors.map((error) => ({
        documentId: error.sourcePath,
        projectName: prepared.project.name,
        sourcePath: error.sourcePath,
        cases: 0,
      })),
    ]),
  });
  progress(
    `midscene-test: preflighted ${preparedProjects.length} projects, ${totalDocuments} documents, ${totalCases} cases, ${totalErrors} collection errors`,
  );

  const effectiveConcurrency = Math.min(
    definition.test.maxConcurrentFiles ?? Number.POSITIVE_INFINITY,
    Math.max(1, totalDocuments),
  );
  await writeTestRunPlan(runDir, preparedProjects);
  const journal = createOperationJournal(runDir);
  const rootController = new AbortController();
  setMaxListeners(
    Math.max(10, effectiveConcurrency + 1),
    rootController.signal,
  );
  const handleSignal = (signal: NodeJS.Signals) => {
    rootController.abort(new Error(`Workflow interrupted by ${signal}.`));
  };
  const sigint = () => handleSignal('SIGINT');
  const sigterm = () => handleSignal('SIGTERM');
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);

  let failedCaseCount = 0;
  const bailReached = () =>
    definition.test.bail > 0 && failedCaseCount >= definition.test.bail;
  let shutdownDeadline: number | undefined;
  const beginShutdown = () => {
    shutdownDeadline ??= Date.now() + definition.test.teardownTimeout;
  };
  rootController.signal.addEventListener('abort', beginShutdown, {
    once: true,
  });
  const addFailedCases = (count: number) => {
    failedCaseCount += count;
    if (bailReached()) beginShutdown();
  };
  const teardownTimeoutMs = () =>
    Math.max(
      0,
      Math.min(
        definition.test.teardownTimeout,
        shutdownDeadline === undefined
          ? Number.POSITIVE_INFINITY
          : shutdownDeadline - Date.now(),
      ),
    );
  let hasInfrastructureError = false;
  const infrastructureErrors: unknown[] = [];
  const recordInfrastructureError = (error: unknown) => {
    const errors =
      error instanceof WorkflowExecutionFailure ? error.errors : [error];
    for (const item of errors)
      if (!infrastructureErrors.includes(item)) infrastructureErrors.push(item);
    hasInfrastructureError = true;
    rootController.abort(error);
  };
  const runInfrastructureCallback = <T>(callback: () => T): T => {
    try {
      return callback();
    } catch (error) {
      recordInfrastructureError(error);
      throw error;
    }
  };
  const stopObservingOperations = observeResourceOperations(
    rootController.signal,
    (event) => {
      try {
        journal.append(event);
      } catch (error) {
        recordInfrastructureError(
          new WorkflowPublicationError('write-result', journal.path, error),
        );
        getDebug('test-runner:operations', { console: true })(
          `Could not persist operation event: ${String(error)}`,
        );
      }
    },
  );
  type PreparedProject = (typeof preparedProjects)[number];
  const announceProject = (prepared: PreparedProject, projectIndex: number) => {
    const { project } = prepared;
    runInfrastructureCallback(() =>
      progress(
        `[project ${projectIndex + 1}/${preparedProjects.length}] ${project.name}`,
      ),
    );
  };
  const buildProjectResult = (
    prepared: PreparedProject,
    cases: readonly TestProjectCaseRunResult[],
    documents: readonly WorkflowDocumentRunResult[],
    lifecycle?: TestExecutionProjectRunResult['lifecycle'],
  ): TestExecutionProjectRunResult => {
    const { project } = prepared;
    const projectFailed =
      prepared.collectionErrors.length > 0 ||
      latestById(cases, (item) => item.caseId).some(
        (item) => item.status !== 'success',
      ) ||
      latestById(documents, (item) => item.documentId).some(
        (item) => item.status === 'failed',
      ) ||
      lifecycle?.status === 'failed';
    return {
      projectId: project.projectId,
      name: project.name,
      ...(prepared.platform ? { platform: prepared.platform } : {}),
      status: projectFailed ? 'failed' : 'success',
      retry: project.retry,
      fileSelection: prepared.fileSelection,
      tagSelection: project.tags,
      sourceCount: prepared.sources.length,
      selectedCaseCount: prepared.selectedCaseCount,
      filteredCaseCount: prepared.filteredCaseCount,
      ...(lifecycle ? { lifecycle } : {}),
      cases,
      plans: prepared.plans,
      documents,
      collectionErrors: prepared.collectionErrors,
    };
  };
  const buildSkippedProjectResult = (
    prepared: PreparedProject,
    projectIndex: number,
    reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
  ): TestExecutionProjectRunResult => {
    announceProject(prepared, projectIndex);
    return buildProjectResult(prepared, notRunSuite(prepared, reason), []);
  };
  const projectResults: Array<TestExecutionProjectRunResult | undefined> =
    new Array(preparedProjects.length);

  try {
    const states = await runPreparedFiles({
      projects: preparedProjects,
      maxConcurrentFiles: effectiveConcurrency,
      maxConcurrentProjects:
        definition.test.maxConcurrentProjects ?? Number.POSITIVE_INFINITY,
      setupTimeoutMs: definition.test.setupTimeout,
      teardownTimeoutMs,
      signal: rootController.signal,
      runDir,
      preflightFailed: plan.preflightScope === 'run' && totalErrors > 0,
      shouldBail: bailReached,
      addFailedCases,
      announceProject,
      onProgress: (prepared, message) =>
        runInfrastructureCallback(() =>
          progress(
            effectiveConcurrency > 1
              ? `[${prepared.project.name}]${message}`
              : message,
          ),
        ),
      onEvent: (event) =>
        runInfrastructureCallback(() => plan.onEvent?.(event)),
      onInfrastructureError: recordInfrastructureError,
    });
    states.forEach((state, index) => {
      projectResults[index] = buildProjectResult(
        state.prepared,
        state.cases,
        state.documents,
        state.lifecycle,
      );
    });
  } catch (error) {
    recordInfrastructureError(error);
  } finally {
    stopObservingOperations();
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }

  const completedProjectResults = preparedProjects.map(
    (prepared, projectIndex) => {
      const result = projectResults[projectIndex];
      if (result) return result;
      const reason = prepared.collectionErrors.length
        ? 'project-preflight-failed'
        : rootController.signal.aborted
          ? 'interrupted'
          : bailReached()
            ? 'bail'
            : undefined;
      if (!reason) {
        throw new Error(
          `Project scheduler did not produce a result for "${prepared.project.name}".`,
        );
      }
      return buildSkippedProjectResult(prepared, projectIndex, reason);
    },
  );

  const summary = summarize(completedProjectResults);
  const failed =
    hasInfrastructureError ||
    rootController.signal.aborted ||
    summary.failed > 0 ||
    summary.notRun > 0 ||
    summary.collectionErrors > 0 ||
    summary.documentFailures > 0 ||
    summary.projectFailures > 0;
  const endedAt = new Date();
  const result: TestProjectRunResult = {
    schemaVersion: 3,
    operationLog: { path: journal.path, snapshotAt: endedAt.toISOString() },
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    status: failed ? 'failed' : 'success',
    exitCode: failed ? 1 : 0,
    resultDir,
    summaryPath,
    reportDir,
    summary,
    projects: completedProjectResults,
    cases: completedProjectResults.flatMap((project) => project.cases),
    documents: completedProjectResults.flatMap((project) => project.documents),
    collectionErrors: completedProjectResults.flatMap(
      (project) => project.collectionErrors,
    ),
    ...(hasInfrastructureError
      ? { errors: infrastructureErrors.map(asExecutionError) }
      : {}),
  };
  let completedResult = result;
  let reportIndex: TestRunReportSourceIndex | undefined;
  const publish = async (
    operation: 'write-result' | 'write-report',
    path: string,
    callback: () => unknown | Promise<unknown>,
  ): Promise<boolean> => {
    try {
      await callback();
      return true;
    } catch (error) {
      recordInfrastructureError(
        error instanceof WorkflowPublicationError ||
          error instanceof WorkflowExecutionFailure
          ? error
          : new WorkflowPublicationError(operation, path, error),
      );
      completedResult = {
        ...completedResult,
        status: 'failed',
        exitCode: 1,
        errors: infrastructureErrors.map(asExecutionError),
      };
      return false;
    }
  };
  const writeSummary = () =>
    publish('write-result', summaryPath, () =>
      writeTestProjectRunResult({
        projectRoot,
        ...(configPath ? { configPath } : {}),
        result: completedResult,
      }),
    );
  const writeReport = () =>
    publish('write-report', reportDir, async () => {
      if (!plan.reportEnabled) return;
      const reportPath = await new TestRunReportAssembler().assembleAsync({
        outputDir: reportDir,
        reportFileName: `midscene-e2e-${runId}`,
        overwrite: false,
        sources: collectTestRunReportSources(completedResult),
        buildRunnerDump: (index) => {
          reportIndex = index;
          const dump = buildTestRunReportDump(completedResult, index);
          completedResult = { ...completedResult, metrics: dump.metrics };
          const warn = getDebug('test-runner:report-assembler', {
            console: true,
          });
          for (const diagnostic of dump.diagnostics ?? [])
            warn(diagnostic.message);
          return dump;
        },
      });
      completedResult = { ...completedResult, reportPath };
    });
  // Publish each artifact once. The summary includes the report path or its
  // failure. If the summary itself fails, the thrown result remains authoritative;
  // do not rebuild an already-published execution report to backfill that error.
  await writeReport();
  for (const publication of plan.publications)
    await publish(publication.operation, publication.path, async () => {
      await publication.publish(completedResult);
    });
  await publish(
    'write-result',
    join(dirname(summaryPath), 'result.md'),
    async () => {
      if (!completedResult.metrics) {
        const dump = buildTestRunReportDump(
          completedResult,
          reportIndex ?? {
            sources: [],
            metrics: sumTestRunReportMetrics([]),
          },
        );
        completedResult = { ...completedResult, metrics: dump.metrics };
      }
      const markdownPath = await writeTestResultMarkdown(
        completedResult,
        reportIndex,
      );
      completedResult = { ...completedResult, markdownPath };
    },
  );
  await writeSummary();
  if (hasInfrastructureError)
    throw new WorkflowExecutionFailure(completedResult, infrastructureErrors);
  return completedResult;
}
