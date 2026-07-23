import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { CaseRunResult, WorkflowDocumentRunResult } from '../engine/types';
import type { TestProjectCollectionError, TestProjectRunResult } from './types';

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};

const toPosix = (value: string): string => value.split(sep).join('/');

export const caseRunResultPath = (result: CaseRunResult): string =>
  toPosix(join('runs', result.caseId, `${result.runId}.json`));

export const workflowDocumentRunResultPath = (
  result: WorkflowDocumentRunResult,
): string =>
  toPosix(join('documents', result.documentId, `${result.documentRunId}.json`));

export const collectionErrorPath = (
  projectName: string,
  sourcePath: string,
): string => {
  const id = createHash('sha256')
    .update(JSON.stringify([projectName, sourcePath]))
    .digest('hex');
  return toPosix(join('collection-errors', `${id}.json`));
};

export const writeWorkflowDocumentRunResult = (
  resultDir: string,
  result: WorkflowDocumentRunResult,
) => {
  writeJson(join(resultDir, workflowDocumentRunResultPath(result)), result);
};

export const writeCaseRunResult = (
  resultDir: string,
  result: CaseRunResult,
) => {
  writeJson(join(resultDir, caseRunResultPath(result)), result);
};

export const writeCollectionError = (
  resultDir: string,
  collectionError: TestProjectCollectionError,
) => {
  writeJson(
    join(
      resultDir,
      collectionErrorPath(
        collectionError.projectName,
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
  const fact = (path: string) =>
    toPosix(
      join(relativeToSummary(result.summaryPath, result.resultDir), path),
    );

  writeJson(result.summaryPath, {
    schemaVersion: result.schemaVersion,
    runId: result.runId,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    status: result.status,
    exitCode: result.exitCode,
    projectRoot: options.projectRoot,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    factsRoot: relativeToSummary(result.summaryPath, result.resultDir),
    reportDir: relativeToSummary(result.summaryPath, result.reportDir),
    summary: result.summary,
    projects: result.projects.map((project) => ({
      name: project.name,
      platform: project.platform,
      status: project.status,
      repeat: project.repeat,
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
        caseId: outcome.caseId,
        sourcePath: outcome.sourcePath,
        caseIndex: outcome.caseIndex,
        repeatIndex: outcome.repeatIndex,
        name: outcome.name,
        status: outcome.status,
        ...(outcome.notRunReason ? { notRunReason: outcome.notRunReason } : {}),
        ...(outcome.attempts
          ? {
              attempts: outcome.attempts.map((attempt) => ({
                runId: attempt.runId,
                attemptIndex: attempt.attemptIndex,
                status: attempt.status,
                resultFile: fact(caseRunResultPath(attempt)),
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
        documentRunId: document.documentRunId,
        sourcePath: document.sourcePath,
        repeatIndex: document.repeatIndex,
        status: document.status,
        resultFile: fact(workflowDocumentRunResultPath(document)),
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
        errorFile: fact(
          collectionErrorPath(error.projectName, error.sourcePath),
        ),
      })),
    })),
  });
};
