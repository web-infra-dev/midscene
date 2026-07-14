import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { CaseRunResult, WorkflowDocumentRunResult } from '../engine/types';
import type { WorkflowDocumentSource } from '../parser/types';
import type {
  WorkflowCollectionError,
  WorkflowProjectRunResult,
} from './types';

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

export const collectionErrorPath = (sourcePath: string): string => {
  const id = createHash('sha256').update(sourcePath).digest('hex');
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
  collectionError: WorkflowCollectionError,
) => {
  writeJson(join(resultDir, collectionErrorPath(collectionError.sourcePath)), {
    kind: 'collection-error',
    ...collectionError,
  });
};

export interface WorkflowProjectResultFileOptions {
  projectId: string;
  projectRoot: string;
  configPath?: string;
  sources: readonly WorkflowDocumentSource[];
  result: WorkflowProjectRunResult;
}

export const writeWorkflowProjectRunResult = (
  resultDir: string,
  options: WorkflowProjectResultFileOptions,
) => {
  const { result } = options;
  writeJson(join(resultDir, 'project.json'), {
    version: 2,
    projectId: options.projectId,
    projectRoot: options.projectRoot,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    sources: options.sources,
    status: result.status,
    exitCode: result.exitCode,
    resultDir: result.resultDir,
    summary: result.summary,
    cases: result.cases.map((caseResult) => ({
      caseId: caseResult.caseId,
      name: caseResult.name,
      sourcePath: caseResult.sourcePath,
      caseIndex: caseResult.caseIndex,
      status: caseResult.status,
      ...(caseResult.run
        ? { resultFile: caseRunResultPath(caseResult.run) }
        : {}),
      ...(caseResult.notRunReason
        ? { notRunReason: caseResult.notRunReason }
        : {}),
    })),
    documents: result.documents.map((document) => ({
      documentId: document.documentId,
      sourcePath: document.sourcePath,
      status: document.status,
      resultFile: workflowDocumentRunResultPath(document),
    })),
    collectionErrors: result.collectionErrors.map((error) => ({
      sourcePath: error.sourcePath,
      errorFile: collectionErrorPath(error.sourcePath),
    })),
  });
};
