import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  WorkflowExecutionFailure,
  type WorkflowExecutionRecord,
  WorkflowPublicationError,
  asExecutionError,
  runConcurrentJobs,
} from '@midscene/core/internal/test-runner';
import { TestRunReportAssembler } from '@midscene/core/report';
import { resolveWebTarget } from '@midscene/core/yaml';
import { getDebug } from '@midscene/shared/logger';
import { globSync } from 'tinyglobby';
import { createProjectRuntime } from '../engine/project-runtime';
import type { WorkflowDocumentRunResult } from '../engine/types';
import { WorkflowError, WorkflowParseError } from '../errors';
import {
  collectWorkflowDocument,
  createWorkflowDocumentId,
} from '../parser/collect';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  buildTestRunReportDump,
  collectTestRunReportSources,
} from '../report/test-run-report';
import { loadDotenvConfig } from '../runtime/dotenv-loader';
import {
  type YamlBatchBrowserSession,
  assertBrowserContextUsage,
  createYamlBatchBrowser,
} from '../runtime/legacy-browser';
import {
  type LegacyTestRunPlan,
  defaultLegacyConfig,
  matchLegacyYamlFiles,
} from '../runtime/legacy-config';
import {
  type LegacyInvocationArtifacts,
  type PreparedDocumentInvocation,
  executeDocumentInvocation,
} from './document-invocation';
import {
  buildLegacyYamlResults,
  writeLegacyTestSummary,
} from './legacy-summary';
import {
  type LegacyWorkflow,
  collectLegacyWorkflow,
  isLegacyWorkflowFile,
} from './legacy-workflow';
import {
  writeCollectionError,
  writeTestProjectRunResult,
} from './result-store';
import {
  type LoadedExecutionProject,
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
  /** Legacy input semantics, executed by the same document scheduler. */
  legacyPlan?: LegacyTestRunPlan;
  /** Public legacy BatchRunner may delegate without writing its own summary twice. */
  writeLegacySummary?: boolean;
}

interface PreparedExecutionProject<TProjectContext = unknown> {
  project: LoadedExecutionProject<TProjectContext>;
  fileSelection: TestFileSelection;
  sources: readonly WorkflowDocumentSource[];
  documents: readonly CollectedWorkflowDocument[];
  invocations: readonly PreparedDocumentInvocation[];
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

  const match = (patterns: readonly string[]) =>
    globSync(patterns, {
      absolute: true,
      caseSensitiveMatch: false,
      cwd: root,
      dot: true,
      expandDirectories: false,
      followSymbolicLinks: false,
      ignore: [...ALWAYS_IGNORED_PATTERNS, ...(normalized.exclude ?? [])],
      onlyFiles: true,
    }).filter((file) => /\.ya?ml$/i.test(file));
  if (normalized.order === 'listed')
    return normalized.include.flatMap((pattern) =>
      match([pattern])
        .map((file) => resolve(file))
        .sort(),
    );
  const files = match(normalized.include);

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
  selection: LoadedExecutionProject['tags'],
): boolean => {
  if (selection.exclude.some((tag) => tags.includes(tag))) return false;
  return (
    selection.include.length === 0 ||
    selection.include.some((tag) => tags.includes(tag))
  );
};

const filterDocumentCases = (
  document: CollectedWorkflowDocument,
  project: LoadedExecutionProject,
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
  const cases = projects.flatMap((project) =>
    latestById(project.cases, (item) => item.caseId),
  );
  const documents = projects.flatMap((project) =>
    latestById(project.documents, (item) => item.documentId),
  );
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

const latestById = <T>(items: readonly T[], id: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [id(item), item])).values(),
];

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

const prepareProject = async <TProjectContext>(
  project: LoadedExecutionProject<TProjectContext>,
  projectRoot: string,
  runDir: string,
  cwd: string,
  singleFile?: string,
  legacyPlan?: LegacyTestRunPlan,
): Promise<PreparedExecutionProject<TProjectContext>> => {
  const fileSelection = project.files ?? DEFAULT_TEST_FILE_SELECTION;
  const setupFile =
    legacyPlan?.setup ??
    (project.setupFile ? resolve(projectRoot, project.setupFile) : undefined);
  const mainFiles =
    legacyPlan?.files ??
    (singleFile ? [singleFile] : discoverTestFiles(projectRoot, fileSelection));
  const files = [
    ...(setupFile ? [setupFile] : []),
    ...mainFiles.filter((file) => file !== setupFile),
  ];
  const occurrences = new Map<string, number>();
  const sources = files.map((absolutePath) => {
    const invocationIndex = occurrences.get(absolutePath) ?? 0;
    occurrences.set(absolutePath, invocationIndex + 1);
    return {
      projectId: project.projectId,
      projectName: project.name,
      sourcePath: toPosix(relative(projectRoot, absolutePath)),
      absolutePath,
      invocationIndex,
    };
  });
  const collectionErrors: TestProjectCollectionError[] = [];
  const documents: CollectedWorkflowDocument[] = [];
  const legacyWorkflows = new Map<string, LegacyWorkflow>();
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
    await writeCollectionError(runDir, error);
  }

  for (const source of sources) {
    try {
      const legacy = await collectLegacyWorkflow(
        source,
        cwd,
        legacyPlan?.globalConfig,
      );
      if (legacy) {
        // Legacy tasks have no tags. Selection can exclude the whole file,
        // but must never turn a file retry into independently retried tasks.
        if (source.absolutePath !== setupFile && !matchesTags([], project.tags))
          filteredCaseCount += legacy.document.cases.length;
        else {
          documents.push(legacy.document);
          legacyWorkflows.set(legacy.document.documentId, legacy);
        }
        continue;
      }
      if (legacyPlan)
        throw new WorkflowParseError(
          'Legacy batch options require tasks/flow YAML. Use a TypeScript project config for native cases.',
          { sourcePath: source.sourcePath },
        );
      const collected = collectWorkflowDocument(source, {
        resolveNode: project.nodes.get.bind(project.nodes),
        variables: project.variables,
        env: process.env,
      });
      const filtered =
        source.absolutePath === setupFile
          ? { document: collected, filtered: 0 }
          : filterDocumentCases(collected, project);
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
      await writeCollectionError(runDir, collectionError);
    }
  }

  return {
    project,
    fileSelection,
    sources,
    documents,
    invocations: documents.map((document): PreparedDocumentInvocation => {
      const workflow = legacyWorkflows.get(document.documentId);
      return workflow
        ? { kind: 'legacy', document, workflow }
        : { kind: 'native', document };
    }),
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
  const inputPath = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  const singleFile =
    inputPath && existsSync(inputPath) && statSync(inputPath).isFile()
      ? inputPath
      : undefined;
  if (singleFile && !/\.ya?ml$/i.test(singleFile))
    throw new Error(
      `Test input must be a YAML file or project directory: ${singleFile}`,
    );
  const cliProjectRoot = singleFile ? dirname(singleFile) : inputPath;
  if (cliProjectRoot) assertDirectory(cliProjectRoot, 'Test project directory');
  const configSearchRoot = cliProjectRoot ?? cwd;
  // Legacy inputs may sit beside an old batch config named midscene.config.yaml.
  // Only an explicit config or an actual native config can opt them into Test's
  // config discovery rules; preserve the old matcher's selected files otherwise.
  const unconfiguredFiles =
    !options.legacyPlan &&
    !options.configPath &&
    !existsSync(join(configSearchRoot, CONFIG_NAME))
      ? await matchLegacyYamlFiles(singleFile ?? cliProjectRoot ?? cwd)
      : undefined;
  const bareLegacyInput =
    !!unconfiguredFiles?.length &&
    unconfiguredFiles.every(isLegacyWorkflowFile);
  const configPath =
    options.legacyPlan || bareLegacyInput
      ? undefined
      : options.configPath
        ? resolve(configSearchRoot, options.configPath)
        : discoverTestConfig(configSearchRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Midscene config does not exist: ${configPath}`);
  }

  let legacyPlan = options.legacyPlan;
  if (legacyPlan && options.projectNames?.length)
    throw new Error(
      '--project requires a TypeScript project config. Use files in the legacy batch config.',
    );
  if (!configPath && !legacyPlan) {
    const files =
      unconfiguredFiles ??
      (await matchLegacyYamlFiles(singleFile ?? cliProjectRoot ?? cwd));
    if (files.length && files.every(isLegacyWorkflowFile)) {
      // Bare legacy projects keep the old CLI's file selection and fail-stop
      // defaults. Explicit native configs retain Test's selection and bail rules.
      legacyPlan = {
        ...defaultLegacyConfig,
        files,
        summary: `summary-${Date.now()}.json`,
        bail: 1,
      };
    }
  }
  if (legacyPlan) loadDotenvConfig({ cwd, ...legacyPlan });
  let definition = await loadTestProject<unknown>(configPath);
  if (legacyPlan)
    definition = {
      ...definition,
      test: {
        ...definition.test,
        maxConcurrency: 1,
        bail: legacyPlan.bail,
      },
      projects: [
        {
          ...definition.projects[0],
          name: 'legacy',
          retry: legacyPlan.retry,
          retryScope: 'document',
          fileConcurrency: legacyPlan.concurrent,
          ...(legacyPlan.setup ? { setupFile: legacyPlan.setup } : {}),
        },
      ],
    };
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
  const preparedProjects: PreparedExecutionProject[] = [];
  for (const project of selectedProjects) {
    const prepared = await prepareProject(
      project,
      projectRoot,
      runDir,
      cwd,
      singleFile,
      legacyPlan,
    );
    preparedProjects.push(prepared);
  }
  const batchInputs = preparedProjects.flatMap((prepared) =>
    prepared.invocations.flatMap((invocation) =>
      invocation.kind === 'legacy'
        ? [
            {
              file: invocation.workflow.source.absolutePath,
              sourceConfig: invocation.workflow.sourceConfig,
              executionConfig: invocation.workflow.script,
            },
          ]
        : [],
    ),
  );
  if (legacyPlan)
    assertBrowserContextUsage(
      legacyPlan.setup
        ? batchInputs.find((input) => input.file === legacyPlan.setup)
        : undefined,
      batchInputs,
      legacyPlan.shareBrowserContext,
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
  let batchBrowser: YamlBatchBrowserSession | undefined;
  const legacyArtifacts = new Map<string, LegacyInvocationArtifacts>();
  const batchRuntime =
    totalErrors === 0 &&
    legacyPlan?.shareBrowserContext &&
    batchInputs.some((input) => !!resolveWebTarget(input.executionConfig))
      ? createProjectRuntime({
          project: { ...definition.projects[0], name: 'legacy batch browser' },
          signal: rootController.signal,
          setup: {
            name: 'legacy batch browser',
            async setup(ctx) {
              batchBrowser = await createYamlBatchBrowser(legacyPlan!);
              ctx.onTeardown(() => batchBrowser!.close());
            },
          },
        })
      : undefined;
  const bailReached = () =>
    definition.test.bail > 0 && failedCaseCount >= definition.test.bail;
  let hasInfrastructureError = false;
  const infrastructureErrors: unknown[] = [];
  const recordInfrastructureError = (error: unknown) => {
    const errors =
      error instanceof WorkflowExecutionFailure ? error.errors : [error];
    for (const item of errors)
      if (!infrastructureErrors.includes(item)) infrastructureErrors.push(item);
    hasInfrastructureError = true;
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
        `[project ${projectIndex + 1}/${preparedProjects.length}] ${project.name}`,
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
      latestById(cases, (item) => item.caseId).some(
        (item) => item.status !== 'success',
      ) ||
      latestById(documents, (item) => item.documentId).some(
        (item) => item.status === 'failed',
      ) ||
      lifecycle?.status === 'failed';
    return {
      projectId: project.projectId,
      name: project.name,
      platform: legacyPlan ? 'auto' : 'test',
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
    const executionRecords: WorkflowExecutionRecord[] = [];
    let lifecycle: TestExecutionProjectRunResult['lifecycle'];
    let projectFatal = false;

    if (
      prepared.collectionErrors.length > 0 ||
      (legacyPlan && totalErrors > 0)
    ) {
      cases.push(...notRunSuite(prepared, 'project-preflight-failed'));
    } else if (rootController.signal.aborted) {
      cases.push(...notRunSuite(prepared, 'interrupted'));
    } else if (bailReached()) {
      cases.push(...notRunSuite(prepared, 'bail'));
    } else {
      const runtime = createProjectRuntime({
        project,
        setup: project.setup,
        signal: batchRuntime?.signal ?? rootController.signal,
      });
      let hasProjectExecutionError = false;
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
          const runDocument = async (
            invocation: PreparedDocumentInvocation,
            documentIndex: number,
          ) => {
            const { document } = invocation;
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
              return;
            }
            projectProgress(
              `  [document ${documentIndex + 1}/${prepared.documents.length}] ${document.sourcePath}`,
            );
            await executeDocumentInvocation({
              invocation,
              project,
              definition,
              projectContext: runtime.context,
              runDir,
              signal: runtime.signal,
              rootSignal: rootController.signal,
              legacyPlan,
              batchBrowser,
              getLegacyPlayerOptions: definition.legacy
                ? () => definition.legacy!.getOptions(runtime.context)
                : undefined,
              shouldBail: bailReached,
              isProjectFatal: () => projectFatal,
              markProjectFatal: () => {
                projectFatal = true;
              },
              addFailedCases: (count) => {
                failedCaseCount += count;
              },
              onProgress: projectProgress,
              onDocumentResult: async (result) => {
                await project.setup?.onDocumentResult?.(
                  result,
                  runtime.context,
                );
              },
              sinks: {
                cases,
                documents,
                executionRecords,
                legacyArtifacts,
              },
            });
          };
          let setupFailed = false;
          const setupCount = project.setupFile ? 1 : 0;
          if (setupCount) {
            await runDocument(prepared.invocations[0], 0);
            setupFailed =
              documents.at(-1)?.status === 'failed' ||
              latestById(cases, (item) => item.caseId).some(
                (item) => item.status !== 'success',
              );
          }
          if (!setupFailed) {
            await runConcurrentJobs(
              prepared.invocations.slice(setupCount),
              {
                concurrency: project.fileConcurrency ?? 1,
                shouldStop: () =>
                  rootController.signal.aborted ||
                  bailReached() ||
                  projectFatal,
              },
              async (invocation, index) => {
                try {
                  await runDocument(invocation, index + setupCount);
                } catch (error) {
                  recordInfrastructureError(error);
                  throw error;
                }
              },
            );
          }
          const completed = new Set(cases.map((item) => item.caseId));
          const reason = setupFailed
            ? 'project-setup-failed'
            : rootController.signal.aborted
              ? 'interrupted'
              : projectFatal
                ? 'fatal-error'
                : 'bail';
          cases.push(
            ...notRunSuite(prepared, reason).filter(
              (item) => !completed.has(item.caseId),
            ),
          );
        }
      } catch (error) {
        hasProjectExecutionError = true;
        recordInfrastructureError(error);
      } finally {
        const hasFailure =
          hasProjectExecutionError ||
          latestById(cases, (item) => item.caseId).some(
            (item) => item.status !== 'success',
          ) ||
          latestById(documents, (item) => item.documentId).some(
            (item) => item.status === 'failed',
          ) ||
          projectFatal ||
          rootController.signal.aborted;
        lifecycle = await runtime.finish(hasFailure ? 'failed' : 'success');
      }
      if (hasProjectExecutionError) {
        const completed = new Set(cases.map((item) => item.caseId));
        cases.push(
          ...notRunSuite(prepared, 'interrupted').filter(
            (item) => !completed.has(item.caseId),
          ),
        );
      }
    }

    const order = new Map(
      prepared.documents.map((document, index) => [document.documentId, index]),
    );
    const documentOrder = (id: string) =>
      order.get(id) ?? Number.MAX_SAFE_INTEGER;
    cases.sort(
      (a, b) =>
        documentOrder(a.documentId) - documentOrder(b.documentId) ||
        a.caseIndex - b.caseIndex,
    );
    documents.sort(
      (a, b) =>
        documentOrder(a.documentId) - documentOrder(b.documentId) ||
        (a.attemptIndex ?? 0) - (b.attemptIndex ?? 0),
    );
    executionRecords.sort(
      (a, b) =>
        documentOrder(a.document.documentId) -
          documentOrder(b.document.documentId) ||
        a.attemptIndex - b.attemptIndex,
    );
    return {
      ...buildProjectResult(prepared, cases, documents, lifecycle),
      ...(executionRecords.length ? { executionRecords } : {}),
    };
  };

  const projectResults: Array<TestExecutionProjectRunResult | undefined> =
    new Array(preparedProjects.length);

  try {
    if (batchRuntime) {
      const lifecycle = await batchRuntime.start();
      if (!batchRuntime.canRun && lifecycle.setupError)
        recordInfrastructureError(lifecycle.setupError);
    }
    await runConcurrentJobs(
      preparedProjects,
      {
        concurrency: effectiveConcurrency,
        shouldStop: () =>
          hasInfrastructureError ||
          rootController.signal.aborted ||
          bailReached(),
      },
      async (prepared, index) => {
        try {
          projectResults[index] = await runPreparedProject(prepared, index);
        } catch (error) {
          recordInfrastructureError(error);
          throw error;
        }
      },
    );
  } catch (error) {
    recordInfrastructureError(error);
  } finally {
    if (batchRuntime) {
      const lifecycle = await batchRuntime.finish(
        hasInfrastructureError ? 'failed' : 'success',
      );
      for (const error of lifecycle.teardownErrors ?? [])
        recordInfrastructureError(error);
    }
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }

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
    hasInfrastructureError ||
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
    ...(hasInfrastructureError
      ? { errors: infrastructureErrors.map(asExecutionError) }
      : {}),
  };
  let completedResult = result;
  const publish = async (
    operation: 'write-result' | 'write-report',
    path: string,
    callback: () => unknown | Promise<unknown>,
  ): Promise<boolean> => {
    try {
      await callback();
      return true;
    } catch (error) {
      recordInfrastructureError(
        error instanceof WorkflowPublicationError ||
          error instanceof WorkflowExecutionFailure
          ? error
          : new WorkflowPublicationError(operation, path, error),
      );
      completedResult = {
        ...completedResult,
        status: 'failed',
        exitCode: 1,
        errors: infrastructureErrors.map(asExecutionError),
      };
      return false;
    }
  };
  const writeSummary = () =>
    publish('write-result', summaryPath, () =>
      writeTestProjectRunResult({
        projectRoot,
        ...(configPath ? { configPath } : {}),
        result: completedResult,
      }),
    );
  const writeReport = () =>
    publish('write-report', reportDir, async () => {
      const reportPath = await new TestRunReportAssembler().assembleAsync({
        outputDir: reportDir,
        reportFileName: `test-run-${runId}`,
        overwrite: true,
        sources: collectTestRunReportSources(completedResult),
        buildRunnerDump: (index) => {
          const dump = buildTestRunReportDump(completedResult, index);
          const warn = getDebug('test-runner:report-assembler', {
            console: true,
          });
          for (const diagnostic of dump.diagnostics ?? [])
            warn(diagnostic.message);
          return dump;
        },
      });
      completedResult = { ...completedResult, reportPath };
    });
  // Publish each artifact once. The summary includes the report path or its
  // failure. If the summary itself fails, the thrown result remains authoritative;
  // do not rebuild an already-published execution report to backfill that error.
  await writeReport();
  if (legacyPlan) {
    const occurrences = preparedProjects.flatMap((prepared) =>
      prepared.sources.map((source) => ({
        file: source.absolutePath,
        projectId: prepared.project.projectId,
        documentId: createWorkflowDocumentId(
          source.projectId,
          source.sourcePath,
          source.invocationIndex,
        ),
        artifacts: legacyArtifacts.get(
          createWorkflowDocumentId(
            source.projectId,
            source.sourcePath,
            source.invocationIndex,
          ),
        ),
      })),
    );
    completedResult = {
      ...completedResult,
      legacyResults: buildLegacyYamlResults(completedResult, occurrences),
    };
    if (options.writeLegacySummary !== false)
      await publish('write-result', legacyPlan.summary, () => {
        return writeLegacyTestSummary(
          legacyPlan.summary,
          completedResult,
          occurrences,
        );
      });
  }
  await writeSummary();
  if (hasInfrastructureError)
    throw new WorkflowExecutionFailure(completedResult, infrastructureErrors);
  return completedResult;
}
