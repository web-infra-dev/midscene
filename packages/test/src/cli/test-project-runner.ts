import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { TestRunReportAssembler } from '@midscene/core/report';
import { globSync } from 'tinyglobby';
import { WorkflowError, WorkflowParseError } from '../errors';
import { collectWorkflowDocument } from '../parser/collect';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  buildTestRunReportDump,
  collectTestRunReportSources,
} from '../report/test-run-report';
import {
  type PreparedCaseExecutionProject,
  runCaseExecution,
} from './case-execution';
import { runProjectExecution } from './project-execution';
import {
  writeCollectionError,
  writeTestProjectRunResult,
} from './result-store';
import {
  type LoadedExecutionProject,
  type ResolvedExecutionProject,
  type TestFileSelection,
  type TestTagSelection,
  loadTestProject,
  validateTestFileSelection,
} from './test-project';
import type {
  TestExecutionProjectRunResult,
  TestProjectCollectionError,
  TestProjectRunResult,
  TestProjectRunSummary,
} from './types';

const CONFIG_NAMES = ['midscene.config.ts', 'midscene.config.mjs'] as const;
const CONFIG_PREFIX = 'midscene.config.';
const ALWAYS_IGNORED_PATTERNS = [
  '.git/**',
  '.midscene/**',
  'midscene_run/**',
  'node_modules/**',
  '**/.git/**',
  '**/.midscene/**',
  '**/midscene_run/**',
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
  projectNames?: readonly string[];
  paths?: readonly string[];
  caseIds?: readonly string[];
  tags?: TestTagSelection;
  onProgress?(message: string): void;
}

type PreparedExecutionProject<TProjectContext = unknown> =
  PreparedCaseExecutionProject<TProjectContext>;

export const discoverTestFiles = (
  projectRoot: string,
  selection: TestFileSelection = DEFAULT_TEST_FILE_SELECTION,
): string[] => {
  const root = resolve(projectRoot);
  const normalized = validateTestFileSelection(selection);
  if (!normalized) throw new TypeError('Test file selection is required.');

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

export const discoverSelectedTestFiles = (
  projectRoot: string,
  paths: readonly string[],
): string[] => {
  const root = resolve(projectRoot);
  const files = new Set<string>();
  for (const requestedPath of paths) {
    if (
      typeof requestedPath !== 'string' ||
      requestedPath.trim().length === 0
    ) {
      throw new TypeError('Test selection paths must be non-empty strings.');
    }
    const absolutePath = resolve(root, requestedPath);
    const relativePath = relative(root, absolutePath);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(
        `Test selection path is outside the project: ${requestedPath}`,
      );
    }
    if (!existsSync(absolutePath)) {
      throw new Error(`Test selection path does not exist: ${requestedPath}`);
    }
    if (statSync(absolutePath).isDirectory()) {
      for (const file of discoverTestFiles(absolutePath)) files.add(file);
    } else if (/\.ya?ml$/i.test(absolutePath)) {
      files.add(absolutePath);
    } else {
      throw new Error(`Test selection file must be YAML: ${requestedPath}`);
    }
  }
  return [...files].sort((a, b) => {
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
  const supported = candidates.filter((name) =>
    CONFIG_NAMES.includes(name as (typeof CONFIG_NAMES)[number]),
  );
  const unsupported = candidates.filter(
    (name) => !CONFIG_NAMES.includes(name as (typeof CONFIG_NAMES)[number]),
  );
  if (unsupported.length > 0) {
    throw new Error(
      [
        `Unsupported or conflicting Midscene configs found in ${root}:`,
        ...candidates.map((name) => `- ${name}`),
        `Only ${CONFIG_NAMES.join(' and ')} are supported.`,
      ].join('\n'),
    );
  }
  if (supported.length > 1) {
    throw new Error(
      [
        `Multiple Midscene configs found in ${root}:`,
        ...supported.map((name) => `- ${name}`),
        'Pass --config <path> to select one explicitly.',
      ].join('\n'),
    );
  }
  return supported[0] ? join(root, supported[0]) : undefined;
};

const defaultResultDir = (projectRoot: string): string =>
  join(projectRoot, '.midscene', 'test-results');

const padDatePart = (value: number): string => String(value).padStart(2, '0');

export const createTestRunId = (
  date = new Date(),
  uuid = randomUUID(),
): string => {
  const timestamp = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join('');
  return `${timestamp}-${uuid.slice(0, 8)}`;
};

const assertDirectory = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
};

const asCollectionError = (
  projectId: string,
  projectName: string,
  sourcePath: string,
  error: unknown,
): TestProjectCollectionError => ({
  projectId,
  projectName,
  sourcePath,
  error:
    error instanceof WorkflowError
      ? error
      : new WorkflowParseError(
          `Failed to collect workflow document "${sourcePath}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          { projectName, sourcePath },
          error,
        ),
});

const matchesTags = (
  tags: readonly string[],
  selection: ResolvedExecutionProject['tags'],
): boolean => {
  if (selection.exclude.some((tag) => tags.includes(tag))) return false;
  return (
    selection.include.length === 0 ||
    selection.include.some((tag) => tags.includes(tag))
  );
};

const matchesOptionalTags = (
  tags: readonly string[],
  selection: TestTagSelection | undefined,
): boolean => {
  if (!selection) return true;
  if (selection.exclude?.some((tag) => tags.includes(tag))) return false;
  return (
    !selection.include?.length ||
    selection.include.some((tag) => tags.includes(tag))
  );
};

const filterDocumentCases = (
  document: CollectedWorkflowDocument,
  project: ResolvedExecutionProject,
  selection?: Pick<TestProjectRunOptions, 'caseIds' | 'tags'>,
): { document?: CollectedWorkflowDocument; filtered: number } => {
  const requestedCaseIds = selection?.caseIds
    ? new Set(selection.caseIds)
    : undefined;
  const cases = document.cases.filter((item) => {
    const tags = item.definition.tags ?? [];
    return (
      matchesTags(tags, project.tags) &&
      matchesOptionalTags(tags, selection?.tags) &&
      (!requestedCaseIds || requestedCaseIds.has(item.caseId))
    );
  });
  const filtered = document.cases.length - cases.length;
  return cases.length === 0
    ? { filtered }
    : { document: { ...document, cases }, filtered };
};

const summarize = (
  projects: readonly TestExecutionProjectRunResult[],
): TestProjectRunSummary => {
  const cases = projects.flatMap((project) => project.cases);
  const documents = projects.flatMap((project) => project.documents);
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

const selectProjects = <TProjectContext>(
  projects: readonly LoadedExecutionProject<TProjectContext>[],
  names: readonly string[] | undefined,
): readonly LoadedExecutionProject<TProjectContext>[] => {
  if (!names || names.length === 0) return projects;
  const requested = new Set(names);
  if (requested.size !== names.length) {
    throw new Error('Each --project name may only be specified once.');
  }
  const known = new Set(projects.map((project) => project.name));
  const unknown = names.find((name) => !known.has(name));
  if (unknown) throw new Error(`Unknown Midscene project: ${unknown}`);
  return projects.filter((project) => requested.has(project.name));
};

const validateUniqueStrings = (
  values: readonly string[] | undefined,
  label: string,
): readonly string[] | undefined => {
  if (values === undefined) return undefined;
  if (
    !Array.isArray(values) ||
    values.some(
      (value) => typeof value !== 'string' || value.trim().length === 0,
    )
  ) {
    throw new TypeError(`${label} must be an array of non-empty strings.`);
  }
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} must not contain duplicates.`);
  }
  return values;
};

const validateRunSelection = (
  options: TestProjectRunOptions,
): Pick<TestProjectRunOptions, 'paths' | 'caseIds' | 'tags'> => {
  const paths = validateUniqueStrings(options.paths, 'Test selection paths');
  const caseIds = validateUniqueStrings(
    options.caseIds,
    'Test selection caseIds',
  );
  const include = validateUniqueStrings(
    options.tags?.include,
    'Test selection tags.include',
  );
  const exclude = validateUniqueStrings(
    options.tags?.exclude,
    'Test selection tags.exclude',
  );
  return {
    ...(paths ? { paths } : {}),
    ...(caseIds ? { caseIds } : {}),
    ...(include || exclude
      ? {
          tags: {
            ...(include ? { include } : {}),
            ...(exclude ? { exclude } : {}),
          },
        }
      : {}),
  };
};

const prepareProject = <TProjectContext>(
  project: LoadedExecutionProject<TProjectContext>,
  projectRoot: string,
  runDir: string,
  selection?: Pick<TestProjectRunOptions, 'paths' | 'caseIds' | 'tags'>,
): PreparedExecutionProject<TProjectContext> => {
  const fileSelection = project.files ?? DEFAULT_TEST_FILE_SELECTION;
  const projectFiles = discoverTestFiles(projectRoot, fileSelection);
  const selectedFiles = selection?.paths?.length
    ? new Set(discoverSelectedTestFiles(projectRoot, selection.paths))
    : undefined;
  const files = selectedFiles
    ? projectFiles.filter((file) => selectedFiles.has(file))
    : projectFiles;
  const sources = files.map((absolutePath) => ({
    projectId: project.projectId,
    projectName: project.name,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
  const collectionErrors: TestProjectCollectionError[] = [];
  const documents: CollectedWorkflowDocument[] = [];
  const availableCaseIds = new Set<string>();
  let filteredCaseCount = 0;

  if (projectFiles.length === 0) {
    const error = asCollectionError(
      project.projectId,
      project.name,
      '<project>',
      new WorkflowParseError(
        `No workflow YAML files found for project "${project.name}" in ${projectRoot}.`,
        { projectName: project.name, projectRoot },
      ),
    );
    collectionErrors.push(error);
    writeCollectionError(runDir, error);
  }

  for (const source of sources) {
    try {
      const collected = collectWorkflowDocument(source, {
        resolveNode: project.nodes.get.bind(project.nodes),
        variables: project.variables,
        env: process.env,
      });
      const duplicateCaseId = collected.cases.find((item) =>
        availableCaseIds.has(item.caseId),
      );
      if (duplicateCaseId) {
        throw new WorkflowParseError(
          `Case id collision in project "${project.name}": ${duplicateCaseId.caseId}.`,
          { caseId: duplicateCaseId.caseId, projectName: project.name },
        );
      }
      for (const item of collected.cases) availableCaseIds.add(item.caseId);
      const filtered = filterDocumentCases(collected, project, selection);
      filteredCaseCount += filtered.filtered;
      if (filtered.document) documents.push(filtered.document);
    } catch (error) {
      const collectionError = asCollectionError(
        project.projectId,
        project.name,
        source.sourcePath,
        error,
      );
      collectionErrors.push(collectionError);
      writeCollectionError(runDir, collectionError);
    }
  }

  return {
    project,
    fileSelection,
    sources,
    documents,
    collectionErrors,
    selectedCaseCount: documents.reduce(
      (total, document) => total + document.cases.length,
      0,
    ),
    filteredCaseCount,
    availableCaseIds: [...availableCaseIds],
  };
};

export async function runTestProject(
  options: TestProjectRunOptions = {},
): Promise<TestProjectRunResult> {
  const startedAt = new Date();
  const runId = createTestRunId(startedAt);
  const cwd = resolve(options.cwd ?? process.cwd());
  assertDirectory(cwd, 'Test working directory');
  const cliProjectRoot = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  if (cliProjectRoot) assertDirectory(cliProjectRoot, 'Test project directory');
  const configSearchRoot = cliProjectRoot ?? cwd;
  const configPath = options.configPath
    ? resolve(configSearchRoot, options.configPath)
    : discoverTestConfig(configSearchRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Midscene config does not exist: ${configPath}`);
  }

  const definition = await loadTestProject(configPath);
  const projectRoot = cliProjectRoot ?? cwd;

  const resultDir = options.resultDir
    ? resolve(cwd, options.resultDir)
    : defaultResultDir(projectRoot);
  const runDir = join(resultDir, runId);
  const summaryPath = join(runDir, 'summary.json');
  const reportDir = resolve(projectRoot, definition.output.reportDir);
  mkdirSync(resultDir, { recursive: true });
  mkdirSync(runDir);
  const selectedProjects = selectProjects(
    definition.projects,
    options.projectNames,
  );
  const selection = validateRunSelection(options);
  const preparedProjects = selectedProjects.map((project) =>
    prepareProject(project, projectRoot, runDir, selection),
  );
  if (selection.caseIds?.length) {
    const availableCaseIds = new Set(
      preparedProjects.flatMap((prepared) => prepared.availableCaseIds),
    );
    const unknownCaseId = selection.caseIds.find(
      (caseId) => !availableCaseIds.has(caseId),
    );
    if (unknownCaseId) {
      throw new Error(`Unknown Midscene case id: ${unknownCaseId}`);
    }
  }
  if (
    (selection.paths?.length ||
      selection.caseIds?.length ||
      selection.tags?.include?.length ||
      selection.tags?.exclude?.length) &&
    preparedProjects.every((prepared) => prepared.selectedCaseCount === 0) &&
    preparedProjects.every((prepared) => prepared.collectionErrors.length === 0)
  ) {
    throw new Error('No Midscene cases matched the requested selection.');
  }
  const progress = options.onProgress ?? (() => {});
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

  const rootController = new AbortController();
  setMaxListeners(
    Math.max(10, definition.test.maxConcurrency + 1),
    rootController.signal,
  );
  const handleSignal = (signal: NodeJS.Signals) => {
    rootController.abort(new Error(`Workflow interrupted by ${signal}.`));
  };
  const sigint = () => handleSignal('SIGINT');
  const sigterm = () => handleSignal('SIGTERM');
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);

  let hasInfrastructureError = false;
  const recordInfrastructureError = (error: unknown) => {
    if (hasInfrastructureError) return;
    hasInfrastructureError = true;
    rootController.abort(error);
  };
  let completedProjectResults: readonly TestExecutionProjectRunResult[];
  try {
    if (definition.test.executionUnit === 'case') {
      completedProjectResults = await runCaseExecution({
        projects: preparedProjects,
        test: definition.test,
        ...(definition.executor ? { executor: definition.executor } : {}),
        runDir,
        signal: rootController.signal,
        progress,
        onInfrastructureError: recordInfrastructureError,
      });
    } else {
      completedProjectResults = await runProjectExecution({
        projects: preparedProjects,
        test: definition.test,
        runDir,
        signal: rootController.signal,
        progress,
        onInfrastructureError: recordInfrastructureError,
      });
    }
  } finally {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }

  const summary = summarize(completedProjectResults);
  const failed =
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
  };
  writeTestProjectRunResult({
    projectRoot,
    ...(configPath ? { configPath } : {}),
    result,
  });
  const reportPath = new TestRunReportAssembler().assemble({
    outputDir: reportDir,
    reportFileName: `test-run-${runId}`,
    sources: collectTestRunReportSources(result),
    buildRunnerDump: (index) => buildTestRunReportDump(result, index),
  });
  const completedResult: TestProjectRunResult = { ...result, reportPath };
  writeTestProjectRunResult({
    projectRoot,
    ...(configPath ? { configPath } : {}),
    result: completedResult,
  });
  return completedResult;
}
