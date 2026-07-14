import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type { WorkflowDocumentRunResult } from '../engine/types';
import { WorkflowError, WorkflowParseError } from '../errors';
import { collectWorkflowDocument } from '../parser/collect';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  writeCaseRunResult,
  writeCollectionError,
  writeWorkflowDocumentRunResult,
  writeWorkflowProjectRunResult,
} from './result-store';
import type {
  ProjectCaseRunResult,
  WorkflowCollectionError,
  WorkflowProjectRunResult,
  WorkflowProjectRunSummary,
} from './types';
import { loadWorkflowProjectSync } from './workflow-project';

const CONFIG_NAMES = [
  'midscene.workflow.config.cjs',
  'midscene.workflow.config.js',
];
const SKIPPED_DIRECTORIES = new Set(['.git', '.midscene', 'node_modules']);

const toPosix = (value: string): string => value.split(sep).join('/');

export interface WorkflowProjectRunOptions {
  projectRoot: string;
  configPath?: string;
  resultDir?: string;
}

interface CollectedProjectDocument {
  document: CollectedWorkflowDocument;
}

export const discoverWorkflowFiles = (projectRoot: string): string[] => {
  const root = resolve(projectRoot);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          visit(join(directory, entry.name));
        }
        continue;
      }
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  };
  visit(root);
  return files.sort((a, b) =>
    toPosix(relative(root, a)).localeCompare(toPosix(relative(root, b))),
  );
};

export const discoverWorkflowConfig = (
  projectRoot: string,
): string | undefined =>
  CONFIG_NAMES.map((name) => join(resolve(projectRoot), name)).find(existsSync);

const defaultResultDir = (projectRoot: string): string =>
  join(
    projectRoot,
    '.midscene',
    'workflow-results',
    `${Date.now()}-${process.pid}`,
  );

const asCollectionError = (
  sourcePath: string,
  error: unknown,
): WorkflowCollectionError => ({
  sourcePath,
  error:
    error instanceof WorkflowError
      ? error
      : new WorkflowParseError(
          `Failed to collect workflow document "${sourcePath}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          { sourcePath },
          error,
        ),
});

const asNotRun = (
  collectedCase: CollectedCase,
  reason: NonNullable<ProjectCaseRunResult['notRunReason']>,
): ProjectCaseRunResult => ({
  caseId: collectedCase.caseId,
  name: collectedCase.definition.name,
  sourcePath: collectedCase.sourcePath,
  caseIndex: collectedCase.caseIndex,
  status: 'not-run',
  notRunReason: reason,
});

const summarize = (
  cases: readonly ProjectCaseRunResult[],
  documents: readonly WorkflowDocumentRunResult[],
  collectionErrors: readonly WorkflowCollectionError[],
): WorkflowProjectRunSummary => ({
  total: cases.length,
  passed: cases.filter((caseResult) => caseResult.status === 'success').length,
  failed: cases.filter((caseResult) => caseResult.status === 'failed').length,
  notRun: cases.filter((caseResult) => caseResult.status === 'not-run').length,
  collectionErrors: collectionErrors.length,
  documentFailures: documents.filter((document) => document.status === 'failed')
    .length,
});

export async function runWorkflowProject(
  options: WorkflowProjectRunOptions,
): Promise<WorkflowProjectRunResult> {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    throw new Error(
      `Workflow project directory does not exist: ${projectRoot}`,
    );
  }
  const files = discoverWorkflowFiles(projectRoot);
  if (files.length === 0) {
    throw new Error(`No workflow YAML files found in ${projectRoot}.`);
  }
  const resultDir = resolve(options.resultDir ?? defaultResultDir(projectRoot));
  const configPath = options.configPath
    ? resolve(projectRoot, options.configPath)
    : discoverWorkflowConfig(projectRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Workflow config does not exist: ${configPath}`);
  }
  mkdirSync(resultDir, { recursive: true });

  const projectId = basename(projectRoot);
  const sources: WorkflowDocumentSource[] = files.map((absolutePath) => ({
    projectId,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
  const project = loadWorkflowProjectSync(configPath);
  const collectedDocuments: CollectedProjectDocument[] = [];
  const collectionErrors: WorkflowCollectionError[] = [];
  const collectedCaseIds = new Set<string>();

  for (const source of sources) {
    try {
      const document = collectWorkflowDocument(source, {
        resolveNode: project.resolveNode,
        resolveDocumentNode: project.resolveDocumentNode,
      });
      const collided = document.cases.find((collectedCase) =>
        collectedCaseIds.has(collectedCase.caseId),
      );
      if (collided) {
        throw new WorkflowParseError(`Case id collision: ${collided.caseId}.`, {
          caseId: collided.caseId,
          sourcePath: source.sourcePath,
        });
      }
      for (const collectedCase of document.cases) {
        collectedCaseIds.add(collectedCase.caseId);
      }
      collectedDocuments.push({ document });
    } catch (error) {
      const collectionError = asCollectionError(source.sourcePath, error);
      collectionErrors.push(collectionError);
      writeCollectionError(resultDir, collectionError);
    }
  }

  const cases: ProjectCaseRunResult[] = [];
  const documents: WorkflowDocumentRunResult[] = [];
  let interrupted = false;
  const handleSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    for (const { document } of collectedDocuments) {
      if (interrupted) {
        cases.push(
          ...document.cases.map((collectedCase) =>
            asNotRun(collectedCase, 'interrupted'),
          ),
        );
        continue;
      }

      const execution = await runWorkflowDocument(document, {
        resolveNode: project.nodes.require.bind(project.nodes),
        resolveDocumentNode: project.documentNodes.require.bind(
          project.documentNodes,
        ),
        setupDocument: project.setupDocument,
        shouldStop: () => interrupted,
        onCaseResult: (run) => writeCaseRunResult(resultDir, run),
        onDocumentResult: (documentResult) =>
          writeWorkflowDocumentRunResult(resultDir, documentResult),
      });
      cases.push(...execution.cases);
      documents.push(execution.document);
    }
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }

  const summary = summarize(cases, documents, collectionErrors);
  const failed =
    interrupted ||
    summary.failed > 0 ||
    summary.notRun > 0 ||
    summary.collectionErrors > 0 ||
    summary.documentFailures > 0;
  const result: WorkflowProjectRunResult = {
    status: failed ? 'failed' : 'success',
    exitCode: failed ? 1 : 0,
    resultDir,
    summary,
    cases,
    documents,
    collectionErrors,
  };
  writeWorkflowProjectRunResult(resultDir, {
    projectId,
    projectRoot,
    ...(configPath ? { configPath } : {}),
    sources,
    result,
  });
  return result;
}
