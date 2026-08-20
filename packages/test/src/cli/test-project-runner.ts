import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { globSync } from 'tinyglobby';
import { createProjectRuntime } from '../engine/project-runtime';
import { runWorkflowDocument } from '../engine/run-workflow-document';
import type {
  CaseRunOutcome,
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import {
  WorkflowError,
  WorkflowParseError,
  isFatalDeviceError,
} from '../errors';
import { collectWorkflowDocument } from '../parser/collect';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  writeCaseAttemptResult,
  writeCollectionError,
  writeTestProjectRunResult,
  writeWorkflowDocumentResult,
} from './result-store';
import {
  type ResolvedExecutionProject,
  type TestFileSelection,
  loadTestProject,
  validateTestFileSelection,
} from './test-project';
import type {
  TestExecutionProjectRunResult,
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
  onProgress?(message: string): void;
}

interface PreparedExecutionProject<TProjectContext = unknown> {
  project: ResolvedExecutionProject<TProjectContext>;
  fileSelection: TestFileSelection;
  sources: readonly WorkflowDocumentSource[];
  documents: readonly CollectedWorkflowDocument[];
  collectionErrors: readonly TestProjectCollectionError[];
  selectedCaseCount: number;
  filteredCaseCount: number;
}

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

const filterDocumentCases = (
  document: CollectedWorkflowDocument,
  project: ResolvedExecutionProject,
): { document?: CollectedWorkflowDocument; filtered: number } => {
  const cases = document.cases.filter((item) =>
    matchesTags(item.definition.tags ?? [], project.tags),
  );
  const filtered = document.cases.length - cases.length;
  return cases.length === 0
    ? { filtered }
    : { document: { ...document, cases }, filtered };
};

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
  const indent = info.scope === 'case' ? '      ' : '    ';
  const symbol = result.status === 'success' ? '✓' : '✗';
  const error = result.error ? ` — ${result.error.message}` : '';
  const continuation = result.continuedAfterError ? '; continuing' : '';
  return `${indent}${symbol} ${formatStep(info)} (${result.durationMs} ms)${error}${continuation}`;
};

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

const selectProjects = <TProjectContext>(
  projects: readonly ResolvedExecutionProject<TProjectContext>[],
  names: readonly string[] | undefined,
): readonly ResolvedExecutionProject<TProjectContext>[] => {
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

const prepareProject = <TProjectContext>(
  project: ResolvedExecutionProject<TProjectContext>,
  projectRoot: string,
  resolveNode: Parameters<typeof collectWorkflowDocument>[1]['resolveNode'],
  runDir: string,
): PreparedExecutionProject<TProjectContext> => {
  const fileSelection = project.files ?? DEFAULT_TEST_FILE_SELECTION;
  const files = discoverTestFiles(projectRoot, fileSelection);
  const sources = files.map((absolutePath) => ({
    projectId: project.projectId,
    projectName: project.name,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
  const collectionErrors: TestProjectCollectionError[] = [];
  const documents: CollectedWorkflowDocument[] = [];
  let filteredCaseCount = 0;

  if (sources.length === 0) {
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
        resolveNode,
        variables: project.variables,
        env: process.env,
      });
      const filtered = filterDocumentCases(collected, project);
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
  };
};

const notRunSuite = (
  prepared: PreparedExecutionProject,
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult[] =>
  prepared.documents.flatMap((document) =>
    document.cases.map((item) =>
      asNotRun(document.documentId, item, prepared.project.name, reason),
    ),
  );

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
  const preparedProjects = selectedProjects.map((project) =>
    prepareProject(project, projectRoot, definition.resolveNode, runDir),
  );
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
  let firstInfrastructureError: unknown;
  const recordInfrastructureError = (error: unknown) => {
    if (hasInfrastructureError) return;
    hasInfrastructureError = true;
    firstInfrastructureError = error;
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
        `[project ${projectIndex + 1}/${preparedProjects.length}] ${project.name} (${project.platform})`,
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
      cases.some((item) => item.status !== 'success') ||
      documents.some((item) => item.status === 'failed') ||
      lifecycle?.status === 'failed';
    return {
      projectId: project.projectId,
      name: project.name,
      platform: project.platform,
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

    if (prepared.collectionErrors.length > 0) {
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
      let projectExecutionError: unknown;
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
          for (const [
            documentIndex,
            document,
          ] of prepared.documents.entries()) {
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
              continue;
            }
            projectProgress(
              `  [document ${documentIndex + 1}/${prepared.documents.length}] ${document.sourcePath}`,
            );
            const execution = await runWorkflowDocument(document, {
              resolveNode: definition.nodes.require.bind(definition.nodes),
              project,
              projectContext: runtime.context,
              retry: project.retry,
              signal: runtime.signal,
              defaultTimeoutMs: definition.test.testTimeout,
              shouldStop: () =>
                rootController.signal.aborted || bailReached() || projectFatal,
              stopReason: () =>
                rootController.signal.aborted
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
              onStepResult: (info, result) =>
                projectProgress(formatStepResult(info, result)),
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
            if (documentHasFatalError(execution.document)) {
              projectFatal = true;
            }
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
          rootController.signal.aborted;
        lifecycle = await runtime.finish(hasFailure ? 'failed' : 'success');
      }
      if (hasProjectExecutionError) throw projectExecutionError;
    }

    return buildProjectResult(prepared, cases, documents, lifecycle);
  };

  const projectResults: Array<TestExecutionProjectRunResult | undefined> =
    new Array(preparedProjects.length);
  let nextProjectIndex = 0;
  const claimNextProject = (): number | undefined => {
    if (
      hasInfrastructureError ||
      rootController.signal.aborted ||
      bailReached() ||
      nextProjectIndex >= preparedProjects.length
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
          preparedProjects[projectIndex],
          projectIndex,
        );
      }
    } catch (error) {
      recordInfrastructureError(error);
    }
  };

  try {
    await Promise.allSettled(
      Array.from({ length: effectiveConcurrency }, () => worker()),
    );
  } finally {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }
  if (hasInfrastructureError) throw firstInfrastructureError;

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
  return result;
}
