import { setMaxListeners } from 'node:events';
import {
  WorkflowExecutionFailure,
  WorkflowPublicationError,
  asExecutionError,
  runConcurrentJobs,
} from '@midscene/core/internal/test-runner';
import type {
  CollectedCase,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import { TestRunReportAssembler } from '@midscene/core/report';
import { getDebug } from '@midscene/shared/logger';
import { createProjectRuntime } from '../engine/project-runtime';
import {
  buildTestRunReportDump,
  collectTestRunReportSources,
} from '../report/test-run-report';
import { executeDocumentInvocation } from './document-invocation';
import type {
  PreparedDocumentInvocation,
  PreparedExecutionProject,
  PreparedTestRunPlan,
} from './execution-plan';
import { writeTestProjectRunResult } from './result-store';
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
  const cases = projects.flatMap((project) =>
    latestById(project.cases, (item) => item.caseId),
  );
  const documents = projects.flatMap((project) =>
    latestById(project.documents, (item) => item.documentId),
  );
  return {
    total: cases.length,
    passed: cases.filter((item) => item.status === 'success').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    notRun: cases.filter((item) => item.status === 'not-run').length,
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
  progress(
    `midscene-test: preflighted ${preparedProjects.length} projects, ${totalDocuments} documents, ${totalCases} cases, ${totalErrors} collection errors`,
  );

  const effectiveConcurrency = Math.min(
    definition.test.maxConcurrency,
    preparedProjects.length,
  );
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
      platform: prepared.platform,
      status: projectFailed ? 'failed' : 'success',
      retry: project.retry,
      fileSelection: prepared.fileSelection,
      tagSelection: project.tags,
      sourceCount: prepared.sources.length,
      selectedCaseCount: prepared.selectedCaseCount,
      filteredCaseCount: prepared.filteredCaseCount,
      ...(lifecycle ? { lifecycle } : {}),
      cases,
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
  const runPreparedProject = async (
    prepared: PreparedProject,
    projectIndex: number,
  ): Promise<TestExecutionProjectRunResult> => {
    const { project } = prepared;
    announceProject(prepared, projectIndex);
    const projectProgress = (message: string) =>
      runInfrastructureCallback(() =>
        progress(
          effectiveConcurrency > 1 ? `[${project.name}]${message}` : message,
        ),
      );
    const cases: TestProjectCaseRunResult[] = [];
    const documents: WorkflowDocumentRunResult[] = [];
    let lifecycle: TestExecutionProjectRunResult['lifecycle'];
    let projectFatal = false;

    if (
      prepared.collectionErrors.length > 0 ||
      (plan.preflightScope === 'run' && totalErrors > 0)
    ) {
      cases.push(...notRunSuite(prepared, 'project-preflight-failed'));
    } else if (rootController.signal.aborted) {
      cases.push(...notRunSuite(prepared, 'interrupted'));
    } else if (bailReached()) {
      cases.push(...notRunSuite(prepared, 'bail'));
    } else {
      const runtime = createProjectRuntime({
        project,
        setup: project.setup,
        signal: rootController.signal,
      });
      let hasProjectExecutionError = false;
      try {
        await runtime.start();
        if (!runtime.canRun) {
          cases.push(
            ...notRunSuite(
              prepared,
              rootController.signal.aborted
                ? 'interrupted'
                : 'project-setup-failed',
            ),
          );
        } else {
          const runDocument = async (
            invocation: PreparedDocumentInvocation,
            documentIndex: number,
          ) => {
            const { document } = invocation;
            if (
              rootController.signal.aborted ||
              bailReached() ||
              projectFatal
            ) {
              const reason = rootController.signal.aborted
                ? 'interrupted'
                : projectFatal
                  ? 'fatal-error'
                  : 'bail';
              cases.push(
                ...document.cases.map((item) =>
                  asNotRun(document.documentId, item, project.name, reason),
                ),
              );
              return;
            }
            projectProgress(
              `  [document ${documentIndex + 1}/${prepared.documents.length}] ${document.sourcePath}`,
            );
            await executeDocumentInvocation({
              invocation,
              project,
              projectContext: runtime.context,
              runDir,
              signal: runtime.signal,
              rootSignal: rootController.signal,
              shouldBail: bailReached,
              isProjectFatal: () => projectFatal,
              markProjectFatal: () => {
                projectFatal = true;
              },
              addFailedCases: (count) => {
                failedCaseCount += count;
              },
              onProgress: projectProgress,
              sinks: {
                cases,
                documents,
              },
            });
          };
          let prerequisiteFailed = false;
          const prerequisite = prepared.invocations.find(
            (invocation) =>
              invocation.document.documentId ===
              prepared.prerequisiteDocumentId,
          );
          const prerequisiteCount = prerequisite ? 1 : 0;
          if (prerequisite) {
            await runDocument(prerequisite, 0);
            prerequisiteFailed =
              documents.at(-1)?.status === 'failed' ||
              latestById(cases, (item) => item.caseId).some(
                (item) => item.status !== 'success',
              );
          }
          if (!prerequisiteFailed) {
            await runConcurrentJobs(
              prepared.invocations.filter(
                (invocation) => invocation !== prerequisite,
              ),
              {
                concurrency: prepared.documentConcurrency,
                shouldStop: () =>
                  rootController.signal.aborted ||
                  bailReached() ||
                  projectFatal,
              },
              async (invocation, index) => {
                try {
                  await runDocument(invocation, index + prerequisiteCount);
                } catch (error) {
                  recordInfrastructureError(error);
                  throw error;
                }
              },
            );
          }
          const completed = new Set(cases.map((item) => item.caseId));
          const reason = prerequisiteFailed
            ? 'project-setup-failed'
            : rootController.signal.aborted
              ? 'interrupted'
              : projectFatal
                ? 'fatal-error'
                : 'bail';
          cases.push(
            ...notRunSuite(prepared, reason).filter(
              (item) => !completed.has(item.caseId),
            ),
          );
        }
      } catch (error) {
        hasProjectExecutionError = true;
        recordInfrastructureError(error);
      } finally {
        const hasFailure =
          hasProjectExecutionError ||
          latestById(cases, (item) => item.caseId).some(
            (item) => item.status !== 'success',
          ) ||
          latestById(documents, (item) => item.documentId).some(
            (item) => item.status === 'failed',
          ) ||
          projectFatal ||
          rootController.signal.aborted;
        lifecycle = await runtime.finish(hasFailure ? 'failed' : 'success');
      }
      if (hasProjectExecutionError) {
        const completed = new Set(cases.map((item) => item.caseId));
        cases.push(
          ...notRunSuite(prepared, 'interrupted').filter(
            (item) => !completed.has(item.caseId),
          ),
        );
      }
    }

    const order = new Map(
      prepared.documents.map((document, index) => [document.documentId, index]),
    );
    const documentOrder = (id: string) =>
      order.get(id) ?? Number.MAX_SAFE_INTEGER;
    cases.sort(
      (a, b) =>
        documentOrder(a.documentId) - documentOrder(b.documentId) ||
        a.caseIndex - b.caseIndex,
    );
    documents.sort(
      (a, b) =>
        documentOrder(a.documentId) - documentOrder(b.documentId) ||
        (a.attemptIndex ?? 0) - (b.attemptIndex ?? 0),
    );
    return buildProjectResult(prepared, cases, documents, lifecycle);
  };

  const projectResults: Array<TestExecutionProjectRunResult | undefined> =
    new Array(preparedProjects.length);

  try {
    await runConcurrentJobs(
      preparedProjects,
      {
        concurrency: effectiveConcurrency,
        shouldStop: () =>
          hasInfrastructureError ||
          rootController.signal.aborted ||
          bailReached(),
      },
      async (prepared, index) => {
        try {
          projectResults[index] = await runPreparedProject(prepared, index);
        } catch (error) {
          recordInfrastructureError(error);
          throw error;
        }
      },
    );
  } catch (error) {
    recordInfrastructureError(error);
  } finally {
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
          const dump = buildTestRunReportDump(completedResult, index);
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
  await writeSummary();
  if (hasInfrastructureError)
    throw new WorkflowExecutionFailure(completedResult, infrastructureErrors);
  return completedResult;
}
