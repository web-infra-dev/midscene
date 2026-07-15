import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { globSync } from 'tinyglobby';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
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
  writeTestProjectRunResult,
  writeWorkflowDocumentRunResult,
} from './result-store';
import {
  type TestFileSelection,
  loadTestProject,
  validateTestFileSelection,
} from './test-project';
import type {
  TestProjectCaseRunResult,
  TestProjectCollectionError,
  TestProjectRunResult,
  TestProjectRunSummary,
} from './types';

const CONFIG_NAME = 'midscene.config.ts';
const CONFIG_PREFIX = 'midscene.config.';
const ALWAYS_IGNORED_PATTERNS = [
  '.git/**',
  '.midscene/**',
  'node_modules/**',
  '**/.git/**',
  '**/.midscene/**',
  '**/node_modules/**',
];

export const DEFAULT_TEST_FILE_SELECTION: TestFileSelection = {
  include: ['**/*.{yaml,yml}'],
};

const toPosix = (value: string): string => value.split(sep).join('/');

export interface TestProjectRunOptions {
  cwd?: string;
  projectRoot?: string;
  configPath?: string;
  resultDir?: string;
  onProgress?(message: string): void;
}

interface CollectedProjectDocument {
  document: CollectedWorkflowDocument;
}

export const discoverTestFiles = (
  projectRoot: string,
  selection: TestFileSelection = DEFAULT_TEST_FILE_SELECTION,
): string[] => {
  const root = resolve(projectRoot);
  const normalized = validateTestFileSelection(selection);
  if (!normalized) {
    throw new TypeError('Test file selection is required.');
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

export const discoverTestConfig = (projectRoot: string): string | undefined => {
  const root = resolve(projectRoot);
  const candidates = readdirSync(root)
    .filter((name) => name.startsWith(CONFIG_PREFIX))
    .sort();
  const unsupported = candidates.filter((name) => name !== CONFIG_NAME);
  if (unsupported.length > 0) {
    throw new Error(
      [
        `Unsupported or conflicting Midscene configs found in ${root}:`,
        ...candidates.map((name) => `- ${name}`),
        `Only ${CONFIG_NAME} is supported.`,
      ].join('\n'),
    );
  }
  return candidates.includes(CONFIG_NAME) ? join(root, CONFIG_NAME) : undefined;
};

const defaultResultDir = (projectRoot: string): string =>
  join(
    projectRoot,
    '.midscene',
    'test-results',
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
): TestProjectCollectionError => ({
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
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult => ({
  caseId: collectedCase.caseId,
  name: collectedCase.definition.name,
  sourcePath: collectedCase.sourcePath,
  caseIndex: collectedCase.caseIndex,
  status: 'not-run',
  notRunReason: reason,
});

const summarize = (
  cases: readonly TestProjectCaseRunResult[],
  documents: readonly WorkflowDocumentRunResult[],
  collectionErrors: readonly TestProjectCollectionError[],
): TestProjectRunSummary => ({
  total: cases.length,
  passed: cases.filter((caseResult) => caseResult.status === 'success').length,
  failed: cases.filter((caseResult) => caseResult.status === 'failed').length,
  notRun: cases.filter((caseResult) => caseResult.status === 'not-run').length,
  collectionErrors: collectionErrors.length,
  documentFailures: documents.filter((document) => document.status === 'failed')
    .length,
});

const stepPosition = (info: StepExecutionInfo) =>
  info.scope === 'case' ? info.case : info.document;

const formatStep = (info: StepExecutionInfo): string => {
  const position = stepPosition(info);
  const phase = position.phase === 'steps' ? 'step' : position.phase;
  return `${phase} ${position.stepIndex + 1}/${info.stepCount}: ${info.node}`;
};

const formatStepResult = (
  info: StepExecutionInfo,
  result: StepRunResult,
): string => {
  const indent = info.scope === 'case' ? '    ' : '  ';
  const symbol = result.status === 'success' ? '✓' : '✗';
  const error = result.error ? ` — ${result.error.message}` : '';
  const continuation = result.continuedAfterError ? '; continuing' : '';
  return `${indent}${symbol} ${formatStep(info)} (${result.durationMs} ms)${error}${continuation}`;
};

const formatNotRunReason = (
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): string =>
  reason === 'document-start-failed'
    ? 'document start failed'
    : 'run interrupted';

export async function runTestProject(
  options: TestProjectRunOptions = {},
): Promise<TestProjectRunResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  assertDirectory(cwd, 'Test working directory');
  const cliProjectRoot = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  if (cliProjectRoot) {
    assertDirectory(cliProjectRoot, 'Test project directory');
  }
  const configSearchRoot = cliProjectRoot ?? cwd;
  const configPath = options.configPath
    ? resolve(configSearchRoot, options.configPath)
    : discoverTestConfig(configSearchRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Midscene config does not exist: ${configPath}`);
  }
  const project = await loadTestProject(configPath);
  const projectRoot = cliProjectRoot
    ? cliProjectRoot
    : project.root
      ? resolve(
          configPath ? dirname(configPath) : configSearchRoot,
          project.root,
        )
      : cwd;
  assertDirectory(projectRoot, 'Test project root');

  const fileSelection = project.files ?? DEFAULT_TEST_FILE_SELECTION;
  const files = discoverTestFiles(projectRoot, fileSelection);
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
  const collectionErrors: TestProjectCollectionError[] = [];
  const collectedCaseIds = new Set<string>();
  const progress = options.onProgress ?? (() => {});

  for (const source of sources) {
    try {
      const document = collectWorkflowDocument(source, {
        resolveNode: project.resolveNode,
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

  const collectedCaseCount = collectedDocuments.reduce(
    (total, { document }) => total + document.cases.length,
    0,
  );
  progress(
    `midscene-test: collected ${collectedDocuments.length} documents, ${collectedCaseCount} cases, ${collectionErrors.length} collection errors`,
  );
  for (const collectionError of collectionErrors) {
    progress(
      `✗ collection: ${collectionError.sourcePath} — ${collectionError.error.message}`,
    );
  }

  const cases: TestProjectCaseRunResult[] = [];
  const documents: WorkflowDocumentRunResult[] = [];
  let interrupted = false;
  const handleSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    for (const [documentIndex, { document }] of collectedDocuments.entries()) {
      if (interrupted) {
        progress(
          `[document ${documentIndex + 1}/${collectedDocuments.length}] ${document.sourcePath}`,
        );
        const notRunCases = document.cases.map((collectedCase) =>
          asNotRun(collectedCase, 'interrupted'),
        );
        for (const outcome of notRunCases) {
          progress(
            `  - case ${outcome.caseIndex + 1}/${document.cases.length}: ${outcome.name} (not run: run interrupted)`,
          );
        }
        progress(
          `- document ${documentIndex + 1}/${collectedDocuments.length}: ${document.sourcePath} (not run: run interrupted)`,
        );
        cases.push(...notRunCases);
        continue;
      }

      progress(
        `[document ${documentIndex + 1}/${collectedDocuments.length}] ${document.sourcePath}`,
      );

      const execution = await runWorkflowDocument(document, {
        resolveNode: project.nodes.require.bind(project.nodes),
        setupDocument: project.setupDocument,
        shouldStop: () => interrupted,
        onCaseStart: (collectedCase) => {
          progress(
            `  [case ${collectedCase.caseIndex + 1}/${document.cases.length}] ${collectedCase.definition.name}`,
          );
        },
        onStepStart: (info) => {
          const indent = info.scope === 'case' ? '    ' : '  ';
          progress(`${indent}→ ${formatStep(info)}`);
        },
        onStepResult: (info, result) => {
          progress(formatStepResult(info, result));
        },
        onCaseResult: (run) => {
          writeCaseRunResult(resultDir, run);
          const symbol = run.status === 'success' ? '✓' : '✗';
          progress(
            `  ${symbol} case ${run.caseIndex + 1}/${document.cases.length}: ${run.name} (${run.durationMs} ms)`,
          );
        },
        onDocumentResult: (documentResult) =>
          writeWorkflowDocumentRunResult(resultDir, documentResult),
      });
      for (const outcome of execution.cases) {
        if (outcome.status === 'not-run' && outcome.notRunReason) {
          progress(
            `  - case ${outcome.caseIndex + 1}/${document.cases.length}: ${outcome.name} (not run: ${formatNotRunReason(outcome.notRunReason)})`,
          );
        }
      }
      const documentSymbol =
        execution.document.status === 'success' ? '✓' : '✗';
      const documentError =
        execution.document.setupError ?? execution.document.teardownErrors?.[0];
      progress(
        `${documentSymbol} document ${documentIndex + 1}/${collectedDocuments.length}: ${document.sourcePath} (${execution.document.durationMs} ms)${documentError ? ` — ${documentError.message}` : ''}`,
      );
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
  const result: TestProjectRunResult = {
    status: failed ? 'failed' : 'success',
    exitCode: failed ? 1 : 0,
    resultDir,
    summary,
    cases,
    documents,
    collectionErrors,
  };
  writeTestProjectRunResult(resultDir, {
    projectId,
    projectRoot,
    ...(configPath ? { configPath } : {}),
    fileSelection,
    sources,
    result,
  });
  return result;
}
