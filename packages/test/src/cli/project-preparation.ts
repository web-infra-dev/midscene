import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { CollectedWorkflowDocument } from '@midscene/core/internal/test-runner';
import { globSync } from 'tinyglobby';
import { WorkflowError, WorkflowParseError } from '../errors';
import { collectWorkflowDocument } from '../parser/collect';
import type {
  PreparedDocumentInvocation,
  PreparedExecutionProject,
  ProjectPreparationOptions,
} from './execution-plan';
import { writeCollectionError } from './result-store';
import type { LoadedExecutionProject, TestFileSelection } from './test-project';
import { validateTestFileSelection } from './test-project';
import type { TestProjectCollectionError } from './types';

export const CONFIG_NAMES = [
  'midscene.config.ts',
  'midscene.config.mjs',
] as const;
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

const discoverResolvedTestFiles = (
  projectRoot: string,
  selection: TestFileSelection,
): string[] => {
  const root = resolve(projectRoot);
  const match = (patterns: readonly string[]) =>
    globSync(patterns, {
      absolute: true,
      caseSensitiveMatch: false,
      cwd: root,
      dot: true,
      expandDirectories: false,
      followSymbolicLinks: false,
      ignore: [...ALWAYS_IGNORED_PATTERNS, ...(selection.exclude ?? [])],
      onlyFiles: true,
    }).filter((file) => /\.ya?ml$/i.test(file));
  const files = match(selection.include);

  return [...new Set(files.map((file) => resolve(file)))].sort((a, b) => {
    const relativeA = toPosix(relative(root, a));
    const relativeB = toPosix(relative(root, b));
    return relativeA < relativeB ? -1 : relativeA > relativeB ? 1 : 0;
  });
};

export const discoverTestFiles = (
  projectRoot: string,
  selection: TestFileSelection = DEFAULT_TEST_FILE_SELECTION,
): string[] => {
  const normalized = validateTestFileSelection(selection);
  if (!normalized) throw new TypeError('Test file selection is required.');
  return discoverResolvedTestFiles(projectRoot, normalized);
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

export const matchesTags = (
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
  selection: ProjectPreparationOptions['selection'],
): { document?: CollectedWorkflowDocument; filtered: number } => {
  const cases = document.cases.filter((item) => {
    const tags = item.definition.tags ?? [];
    return (
      matchesTags(tags, project.tags) &&
      matchesTags(tags, {
        include: selection?.tags?.include ?? [],
        exclude: selection?.tags?.exclude ?? [],
      }) &&
      (!selection?.caseIds?.length || selection.caseIds.includes(item.caseId))
    );
  });
  const filtered = document.cases.length - cases.length;
  return cases.length === 0
    ? { filtered }
    : { document: { ...document, cases }, filtered };
};

export const selectProjects = <TProjectContext>(
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

/** Prepare and validate every document before any Project resource is acquired. */
export async function prepareProject(
  project: LoadedExecutionProject,
  projectRoot: string,
  runDir: string,
  defaultTimeoutMs: number,
  options: ProjectPreparationOptions = {},
): Promise<PreparedExecutionProject> {
  const platform = options.platform?.trim();
  const fileSelection = project.files ?? DEFAULT_TEST_FILE_SELECTION;
  const prerequisiteFile = options.prerequisiteFile
    ? resolve(options.prerequisiteFile)
    : undefined;
  const projectFiles =
    options.files ?? discoverResolvedTestFiles(projectRoot, fileSelection);
  const selectedFiles = options.selection?.paths?.length
    ? new Set(discoverSelectedTestFiles(projectRoot, options.selection.paths))
    : undefined;
  const mainFiles = selectedFiles
    ? projectFiles.filter((file) => selectedFiles.has(file))
    : projectFiles;
  const files = [
    ...(prerequisiteFile ? [prerequisiteFile] : []),
    ...mainFiles.filter((file) => file !== prerequisiteFile),
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
  const invocations: PreparedDocumentInvocation[] = [];
  let filteredCaseCount = 0;
  const availableCaseIds = new Set<string>();

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
      const collected = await options.collectDocument?.(source, project);
      if (collected) {
        filteredCaseCount += collected.filteredCaseCount;
        if (collected.invocation) invocations.push(collected.invocation);
        continue;
      }
      const document = collectWorkflowDocument(source, {
        resolveNode: project.nodes.get.bind(project.nodes),
        variables: project.variables,
        env: process.env,
      });
      const duplicate = document.cases.find((item) =>
        availableCaseIds.has(item.caseId),
      );
      if (duplicate)
        throw new WorkflowParseError(
          `Case id collision in project "${project.name}": ${duplicate.caseId}.`,
          { caseId: duplicate.caseId, projectName: project.name },
        );
      for (const item of document.cases) availableCaseIds.add(item.caseId);
      const filtered =
        source.absolutePath === prerequisiteFile
          ? { document, filtered: 0 }
          : filterDocumentCases(document, project, options.selection);
      filteredCaseCount += filtered.filtered;
      if (filtered.document)
        invocations.push({
          document: filtered.document,
          retry: { scope: 'case', count: project.retry },
          defaultTimeoutMs,
          reportEnabled: true,
          bindings: { resolveNode: project.nodes.require.bind(project.nodes) },
        });
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

  const documents = invocations.map((invocation) => invocation.document);
  const prerequisiteSource = sources.find(
    (source) => source.absolutePath === prerequisiteFile,
  );
  const prerequisiteDocument = documents.find(
    (document) => document.sourcePath === prerequisiteSource?.sourcePath,
  );
  return {
    project,
    ...(platform ? { platform } : {}),
    documentConcurrency: options.documentConcurrency ?? 1,
    ...(prerequisiteDocument
      ? { prerequisiteDocumentId: prerequisiteDocument.documentId }
      : {}),
    fileSelection,
    sources,
    documents,
    invocations,
    collectionErrors,
    selectedCaseCount: documents.reduce(
      (total, document) => total + document.cases.length,
      0,
    ),
    filteredCaseCount,
    availableCaseIds: [...availableCaseIds],
  };
}
