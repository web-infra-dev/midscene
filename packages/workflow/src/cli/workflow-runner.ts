import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { globSync } from 'tinyglobby';
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
import {
  type WorkflowFileSelection,
  loadWorkflowProjectSync,
  validateWorkflowFileSelection,
} from './workflow-project';

const CONFIG_NAMES = [
  'midscene.workflow.config.cjs',
  'midscene.workflow.config.js',
];
const ALWAYS_IGNORED_PATTERNS = [
  '.git/**',
  '.midscene/**',
  'node_modules/**',
  '**/.git/**',
  '**/.midscene/**',
  '**/node_modules/**',
];

export const DEFAULT_WORKFLOW_FILE_SELECTION: WorkflowFileSelection = {
  include: ['**/*.{yaml,yml}'],
};

const toPosix = (value: string): string => value.split(sep).join('/');

export interface WorkflowProjectRunOptions {
  cwd?: string;
  projectRoot?: string;
  configPath?: string;
  resultDir?: string;
}

interface CollectedProjectDocument {
  document: CollectedWorkflowDocument;
}

export const discoverWorkflowFiles = (
  projectRoot: string,
  selection: WorkflowFileSelection = DEFAULT_WORKFLOW_FILE_SELECTION,
): string[] => {
  const root = resolve(projectRoot);
  const normalized = validateWorkflowFileSelection(selection);
  if (!normalized) {
    throw new TypeError('Workflow file selection is required.');
  }

  const files = globSync(normalized.include, {
    absolute: true,
    caseSensitiveMatch: false,
    cwd: root,
    dot: true,
    expandDirectories: false,
    followSymbolicLinks: false,
    ignore: [...ALWAYS_IGNORED_PATTERNS, ...(normalized.exclude ?? [])],
    onlyFiles: true,
  }).filter((file) => /\.ya?ml$/i.test(file));

  return [...new Set(files.map((file) => resolve(file)))].sort((a, b) => {
    const relativeA = toPosix(relative(root, a));
    const relativeB = toPosix(relative(root, b));
    return relativeA < relativeB ? -1 : relativeA > relativeB ? 1 : 0;
  });
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

const assertDirectory = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
};

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
  options: WorkflowProjectRunOptions = {},
): Promise<WorkflowProjectRunResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  assertDirectory(cwd, 'Workflow working directory');
  const cliProjectRoot = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  if (cliProjectRoot) {
    assertDirectory(cliProjectRoot, 'Workflow project directory');
  }
  const configSearchRoot = cliProjectRoot ?? cwd;
  const configPath = options.configPath
    ? resolve(configSearchRoot, options.configPath)
    : discoverWorkflowConfig(configSearchRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Workflow config does not exist: ${configPath}`);
  }
  const project = loadWorkflowProjectSync(configPath);
  const projectRoot = cliProjectRoot
    ? cliProjectRoot
    : project.root
      ? resolve(
          configPath ? dirname(configPath) : configSearchRoot,
          project.root,
        )
      : cwd;
  assertDirectory(projectRoot, 'Workflow project root');

  const fileSelection = project.files ?? DEFAULT_WORKFLOW_FILE_SELECTION;
  const files = discoverWorkflowFiles(projectRoot, fileSelection);
  if (files.length === 0) {
    throw new Error(`No workflow YAML files found in ${projectRoot}.`);
  }
  const resultDir = options.resultDir
    ? resolve(cwd, options.resultDir)
    : defaultResultDir(projectRoot);
  mkdirSync(resultDir, { recursive: true });

  const projectId = basename(projectRoot);
  const sources: WorkflowDocumentSource[] = files.map((absolutePath) => ({
    projectId,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
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
    fileSelection,
    sources,
    result,
  });
  return result;
}
