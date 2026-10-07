import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { WorkflowPublicationError } from '@midscene/core/internal/test-runner';
import type { CaseRunResult, WorkflowDocumentRunResult } from '../engine/types';
import type { TestProjectCollectionError, TestProjectRunResult } from './types';

const writeJson = async (path: string, value: unknown) => {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2));
  } catch (error) {
    throw new WorkflowPublicationError('write-result', path, error);
  }
};

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

const errorJson = (error: unknown) =>
  error instanceof Error && 'toJSON' in error
    ? (error as Error & { toJSON(): unknown }).toJSON()
    : error;

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
    reportDir: relativeToSummary(result.summaryPath, result.reportDir),
    ...(result.reportPath
      ? { report: relativeToSummary(result.summaryPath, result.reportPath) }
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
        ...(outcome.attempts
          ? {
              attempts: outcome.attempts.map((attempt) => ({
                attemptId: attempt.runId,
                attemptIndex: attempt.attemptIndex,
                status: attempt.status,
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
