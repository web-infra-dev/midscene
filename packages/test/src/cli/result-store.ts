import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import {
  WorkflowPublicationError,
  sanitizeReportError,
} from '@midscene/core/internal/test-runner';
import type { CaseRunResult, WorkflowDocumentRunResult } from '../engine/types';
import type { PreparedExecutionProject } from './execution-plan';
import type { TestProjectCollectionError, TestProjectRunResult } from './types';

const writeJson = async (path: string, value: unknown) => {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2));
  } catch (error) {
    throw new WorkflowPublicationError('write-result', path, error);
  }
};

export const writeTestRunPlan = (
  runDir: string,
  projects: readonly PreparedExecutionProject[],
) =>
  writeJson(join(runDir, 'plan.json'), {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    projects: projects.map((item) => ({
      projectId: item.project.projectId,
      name: item.project.name,
      documents: item.plans ?? [],
    })),
  });

const toPosix = (value: string): string => value.split(sep).join('/');

export const caseAttemptResultPath = (
  projectId: string,
  documentId: string,
  result: CaseRunResult,
): string =>
  toPosix(
    join(
      projectId,
      'documents',
      documentId,
      'cases',
      result.caseId,
      `${result.runId}.json`,
    ),
  );

export const workflowDocumentResultPath = (
  result: WorkflowDocumentRunResult,
): string =>
  toPosix(
    join(
      result.projectId,
      'documents',
      result.documentId,
      result.attemptIndex === undefined
        ? 'document.json'
        : `${result.documentRunId}.json`,
    ),
  );

export const collectionErrorPath = (
  projectId: string,
  sourcePath: string,
): string => {
  const id = createHash('sha256')
    .update(JSON.stringify([projectId, sourcePath]))
    .digest('hex');
  return toPosix(join(projectId, 'collection-errors', `${id}.json`));
};

export const writeWorkflowDocumentResult = (
  runDir: string,
  result: WorkflowDocumentRunResult,
) => {
  const { documentRunId: _documentRunId, ...persistedResult } = result;
  return writeJson(
    join(runDir, workflowDocumentResultPath(result)),
    persistedResult,
  );
};

export const writeCaseAttemptResult = (
  runDir: string,
  projectId: string,
  documentId: string,
  result: CaseRunResult,
) => {
  const { runId: attemptId, ...persistedResult } = result;
  return writeJson(
    join(runDir, caseAttemptResultPath(projectId, documentId, result)),
    {
      ...persistedResult,
      attemptId,
    },
  );
};

export const writeCollectionError = (
  runDir: string,
  collectionError: TestProjectCollectionError,
) => {
  return writeJson(
    join(
      runDir,
      collectionErrorPath(
        collectionError.projectId,
        collectionError.sourcePath,
      ),
    ),
    { kind: 'collection-error', ...collectionError },
  );
};

const relativeToSummary = (summaryPath: string, target: string): string => {
  const value = relative(dirname(summaryPath), target);
  return toPosix(value || '.');
};

const errorJson = sanitizeReportError;

export interface TestProjectResultFileOptions {
  projectRoot: string;
  configPath?: string;
  result: TestProjectRunResult;
}

export const writeTestProjectRunResult = (
  options: TestProjectResultFileOptions,
) => {
  const { result } = options;
  const fact = (path: string) => toPosix(path);

  return writeJson(result.summaryPath, {
    schemaVersion: result.schemaVersion,
    runId: result.runId,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    status: result.status,
    exitCode: result.exitCode,
    ...(result.errors?.length ? { errors: result.errors.map(errorJson) } : {}),
    projectRoot: options.projectRoot,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    factsRoot: '.',
    plan: 'plan.json',
    ...(result.operationLog
      ? {
          operationLog: {
            ...result.operationLog,
            path: relativeToSummary(
              result.summaryPath,
              result.operationLog.path,
            ),
          },
        }
      : {}),
    reportDir: relativeToSummary(result.summaryPath, result.reportDir),
    ...(result.reportPath
      ? { report: relativeToSummary(result.summaryPath, result.reportPath) }
      : {}),
    ...(result.markdownPath
      ? { markdown: relativeToSummary(result.summaryPath, result.markdownPath) }
      : {}),
    summary: result.summary,
    projects: result.projects.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      status: project.status,
      retry: project.retry,
      fileSelection: project.fileSelection,
      tagSelection: project.tagSelection,
      sourceCount: project.sourceCount,
      selectedCaseCount: project.selectedCaseCount,
      filteredCaseCount: project.filteredCaseCount,
      ...(project.lifecycle
        ? {
            lifecycle: {
              status: project.lifecycle.status,
              startedAt: project.lifecycle.startedAt,
              endedAt: project.lifecycle.endedAt,
              durationMs: project.lifecycle.durationMs,
              ...(project.lifecycle.cleanup
                ? { cleanup: project.lifecycle.cleanup }
                : {}),
              ...(project.lifecycle.pendingOperations
                ? { pendingOperations: project.lifecycle.pendingOperations }
                : {}),
              ...(project.lifecycle.setupError
                ? { setupError: errorJson(project.lifecycle.setupError) }
                : {}),
              ...(project.lifecycle.teardownErrors
                ? {
                    teardownErrors:
                      project.lifecycle.teardownErrors.map(errorJson),
                  }
                : {}),
            },
          }
        : {}),
      cases: project.cases.map((outcome) => ({
        ...(outcome.documentRunId
          ? { documentRunId: outcome.documentRunId }
          : {}),
        documentId: outcome.documentId,
        caseId: outcome.caseId,
        sourcePath: outcome.sourcePath,
        caseIndex: outcome.caseIndex,
        name: outcome.name,
        status: outcome.status,
        ...(outcome.notRunReason ? { notRunReason: outcome.notRunReason } : {}),
        ...(outcome.execution
          ? {
              execution: {
                executor: outcome.execution.executor,
                resources: outcome.execution.resources,
                ...(outcome.execution.attempts === undefined
                  ? {}
                  : { attempts: outcome.execution.attempts }),
                ...(outcome.execution.failure
                  ? { failure: outcome.execution.failure }
                  : {}),
                ...(outcome.execution.artifacts
                  ? { artifacts: outcome.execution.artifacts }
                  : {}),
                ...(outcome.execution.metadata
                  ? { metadata: outcome.execution.metadata }
                  : {}),
                ...(outcome.execution.lifecycle
                  ? {
                      lifecycle: {
                        status: outcome.execution.lifecycle.status,
                        startedAt: outcome.execution.lifecycle.startedAt,
                        endedAt: outcome.execution.lifecycle.endedAt,
                        durationMs: outcome.execution.lifecycle.durationMs,
                        ...(outcome.execution.lifecycle.setupError
                          ? {
                              setupError: errorJson(
                                outcome.execution.lifecycle.setupError,
                              ),
                            }
                          : {}),
                        ...(outcome.execution.lifecycle.teardownErrors
                          ? {
                              teardownErrors:
                                outcome.execution.lifecycle.teardownErrors.map(
                                  errorJson,
                                ),
                            }
                          : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...(outcome.attempts
          ? {
              attempts: outcome.attempts.map((attempt) => ({
                attemptId: attempt.runId,
                attemptIndex: attempt.attemptIndex,
                status: attempt.status,
                ...(attempt.cleanup ? { cleanup: attempt.cleanup } : {}),
                ...(attempt.pendingOperations
                  ? { pendingOperations: attempt.pendingOperations }
                  : {}),
                ...(attempt.executionStatus
                  ? { executionStatus: attempt.executionStatus }
                  : {}),
                ...(attempt.retryDecision
                  ? { retryDecision: attempt.retryDecision }
                  : {}),
                resultFile: fact(
                  caseAttemptResultPath(
                    project.projectId,
                    outcome.documentId,
                    attempt,
                  ),
                ),
                ...(attempt.reportPaths?.length
                  ? {
                      reports: attempt.reportPaths.map((path) =>
                        relativeToSummary(result.summaryPath, path),
                      ),
                    }
                  : {}),
              })),
            }
          : {}),
      })),
      documents: project.documents.map((document) => ({
        documentId: document.documentId,
        ...(document.attemptIndex === undefined
          ? {}
          : {
              attemptIndex: document.attemptIndex,
              documentRunId: document.documentRunId,
            }),
        sourcePath: document.sourcePath,
        status: document.status,
        ...(document.cleanup ? { cleanup: document.cleanup } : {}),
        ...(document.pendingOperations
          ? { pendingOperations: document.pendingOperations }
          : {}),
        ...(document.executionStatus
          ? { executionStatus: document.executionStatus }
          : {}),
        ...(document.retryDecision
          ? { retryDecision: document.retryDecision }
          : {}),
        resultFile: fact(workflowDocumentResultPath(document)),
        ...(document.reportPaths?.length
          ? {
              reports: document.reportPaths.map((path) =>
                relativeToSummary(result.summaryPath, path),
              ),
            }
          : {}),
      })),
      collectionErrors: project.collectionErrors.map((error) => ({
        sourcePath: error.sourcePath,
        errorFile: fact(collectionErrorPath(error.projectId, error.sourcePath)),
      })),
    })),
  });
};
