import { createProjectRuntime } from '../engine/project-runtime';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  CaseRunOutcome,
  WorkflowDocumentRunResult,
} from '../engine/types';
import { isFatalDeviceError } from '../errors';
import type { PreparedCaseExecutionProject } from './case-execution';
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
import type { ResolvedTestOptions } from './test-project';
import type {
  TestExecutionProjectRunResult,
  TestProjectCaseRunResult,
} from './types';

export interface RunProjectExecutionOptions<TProjectContext = unknown> {
  readonly projects: readonly PreparedCaseExecutionProject<TProjectContext>[];
  readonly test: ResolvedTestOptions;
  readonly runDir: string;
  readonly signal: AbortSignal;
  readonly progress: (message: string) => void;
  readonly onInfrastructureError: (error: unknown) => void;
}

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

const notRunSuite = (
  prepared: PreparedCaseExecutionProject,
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult[] =>
  prepared.documents.flatMap((document) =>
    document.cases.map((item) =>
      asNotRun(document.documentId, item, prepared.project.name, reason),
    ),
  );

export const runProjectExecution = async <TProjectContext>(
  options: RunProjectExecutionOptions<TProjectContext>,
): Promise<readonly TestExecutionProjectRunResult[]> => {
  const { projects, test, runDir, signal, progress, onInfrastructureError } =
    options;
  const effectiveConcurrency = Math.min(test.maxConcurrency, projects.length);
  let failedCaseCount = 0;
  const bailReached = () => test.bail > 0 && failedCaseCount >= test.bail;
  let hasInfrastructureError = false;
  let firstInfrastructureError: unknown;
  const recordInfrastructureError = (error: unknown) => {
    if (hasInfrastructureError) return;
    hasInfrastructureError = true;
    firstInfrastructureError = error;
    onInfrastructureError(error);
  };
  const runInfrastructureCallback = <T>(callback: () => T): T => {
    try {
      return callback();
    } catch (error) {
      recordInfrastructureError(error);
      throw error;
    }
  };
  const announceProject = (
    prepared: PreparedCaseExecutionProject<TProjectContext>,
    projectIndex: number,
  ) => {
    runInfrastructureCallback(() =>
      progress(
        `[project ${projectIndex + 1}/${projects.length}] ${prepared.project.name}`,
      ),
    );
  };
  const buildSkippedProjectResult = (
    prepared: PreparedCaseExecutionProject<TProjectContext>,
    projectIndex: number,
    reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
  ): TestExecutionProjectRunResult => {
    announceProject(prepared, projectIndex);
    return buildProjectResult(prepared, notRunSuite(prepared, reason), []);
  };
  const runPreparedProject = async (
    prepared: PreparedCaseExecutionProject<TProjectContext>,
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

    if (prepared.collectionErrors.length > 0) {
      cases.push(...notRunSuite(prepared, 'project-preflight-failed'));
    } else if (signal.aborted) {
      cases.push(...notRunSuite(prepared, 'interrupted'));
    } else if (bailReached()) {
      cases.push(...notRunSuite(prepared, 'bail'));
    } else {
      const runtime = createProjectRuntime({
        project,
        setup: project.setup,
        signal,
      });
      let hasProjectExecutionError = false;
      let projectExecutionError: unknown;
      try {
        await runtime.start();
        if (!runtime.canRun) {
          cases.push(
            ...notRunSuite(
              prepared,
              signal.aborted ? 'interrupted' : 'project-setup-failed',
            ),
          );
        } else {
          for (const [
            documentIndex,
            document,
          ] of prepared.documents.entries()) {
            if (signal.aborted || bailReached() || projectFatal) {
              const reason = signal.aborted
                ? 'interrupted'
                : projectFatal
                  ? 'fatal-error'
                  : 'bail';
              cases.push(
                ...document.cases.map((item) =>
                  asNotRun(document.documentId, item, project.name, reason),
                ),
              );
              continue;
            }
            projectProgress(
              `  [document ${documentIndex + 1}/${prepared.documents.length}] ${document.sourcePath}`,
            );
            const execution = await runWorkflowDocument(document, {
              resolveNode: project.nodes.require.bind(project.nodes),
              project,
              projectContext: runtime.context,
              retry: project.retry,
              signal: runtime.signal,
              defaultTimeoutMs: test.testTimeout,
              shouldStop: () => signal.aborted || bailReached() || projectFatal,
              stopReason: () =>
                signal.aborted
                  ? 'interrupted'
                  : projectFatal
                    ? 'fatal-error'
                    : 'bail',
              isFatalError: (run) =>
                [...run.beforeEach, ...run.steps, ...run.afterEach].some(
                  (step) => step.error && isFatalDeviceError(step.error),
                ) || (run.teardownErrors ?? []).some(isFatalDeviceError),
              onCaseStart: (collectedCase) => {
                projectProgress(
                  `    [case ${collectedCase.caseIndex + 1}/${document.cases.length}] ${collectedCase.definition.name}`,
                );
              },
              onStepStart: (info) => {
                const indent = info.scope === 'case' ? '      ' : '    ';
                projectProgress(`${indent}→ ${formatStep(info)}`);
              },
              onStepResult: (info, result) => {
                const indent = info.scope === 'case' ? '      ' : '    ';
                projectProgress(formatStepResult(info, result, indent));
              },
              onCaseResult: (attempt) => {
                runInfrastructureCallback(() =>
                  writeCaseAttemptResult(
                    runDir,
                    project.projectId,
                    document.documentId,
                    attempt,
                  ),
                );
                projectProgress(
                  `    ${attempt.status === 'success' ? '✓' : '✗'} attempt ${attempt.attemptIndex + 1}/${project.retry + 1}: ${attempt.name} (${attempt.durationMs} ms)`,
                );
              },
              onCaseOutcome: (outcome) => {
                if (outcome.status === 'failed') failedCaseCount += 1;
                if (caseHasFatalError(outcome)) projectFatal = true;
              },
              onDocumentResult: (documentResult) =>
                runInfrastructureCallback(() =>
                  writeWorkflowDocumentResult(runDir, documentResult),
                ),
            });
            cases.push(
              ...execution.cases.map((outcome) => ({
                ...outcome,
                documentId: document.documentId,
              })),
            );
            if (documentHasFatalError(execution.document)) projectFatal = true;
            documents.push(execution.document);
          }
        }
      } catch (error) {
        hasProjectExecutionError = true;
        projectExecutionError = error;
        recordInfrastructureError(error);
      } finally {
        const hasFailure =
          hasProjectExecutionError ||
          cases.some((item) => item.status !== 'success') ||
          documents.some((item) => item.status === 'failed') ||
          projectFatal ||
          signal.aborted;
        lifecycle = await runtime.finish(hasFailure ? 'failed' : 'success');
      }
      if (hasProjectExecutionError) throw projectExecutionError;
    }

    return buildProjectResult(prepared, cases, documents, lifecycle);
  };

  const projectResults: Array<TestExecutionProjectRunResult | undefined> =
    new Array(projects.length);
  let nextProjectIndex = 0;
  const claimNextProject = (): number | undefined => {
    if (
      hasInfrastructureError ||
      signal.aborted ||
      bailReached() ||
      nextProjectIndex >= projects.length
    ) {
      return undefined;
    }
    const projectIndex = nextProjectIndex;
    nextProjectIndex += 1;
    return projectIndex;
  };
  const worker = async () => {
    try {
      while (true) {
        const projectIndex = claimNextProject();
        if (projectIndex === undefined) return;
        projectResults[projectIndex] = await runPreparedProject(
          projects[projectIndex],
          projectIndex,
        );
      }
    } catch (error) {
      recordInfrastructureError(error);
    }
  };

  await Promise.allSettled(
    Array.from({ length: effectiveConcurrency }, () => worker()),
  );
  if (hasInfrastructureError) throw firstInfrastructureError;
  return projects.map((prepared, projectIndex) => {
    const result = projectResults[projectIndex];
    if (result) return result;
    const reason = prepared.collectionErrors.length
      ? 'project-preflight-failed'
      : signal.aborted
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
  });
};
