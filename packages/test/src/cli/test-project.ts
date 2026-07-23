import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { require as tsxRequire } from 'tsx/cjs/api';
import { tsImport } from 'tsx/esm/api';
import { NodeRegistry } from '../engine/registry';
import type { Awaitable, WorkflowDocumentSetup } from '../engine/types';
import type { WorkflowError } from '../errors';
import type { NodeDefinition } from '../node/types';

export type TestPlatform = 'web' | 'android' | 'ios' | 'computer';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface TestFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface TestTagSelection {
  include?: readonly string[];
  exclude?: readonly string[];
}

export interface TestRunnerDefinition {
  maxConcurrency?: number;
  bail?: number;
  testTimeout?: number;
}

export interface ResolvedTestRunnerDefinition {
  maxConcurrency: 1;
  bail: number;
  testTimeout: number;
}

export interface TestOutputDefinition {
  summary?: string;
  reportDir?: string;
}

export interface ResolvedTestOutputDefinition {
  summary: string;
  reportDir: string;
}

export interface ExecutionProjectDefinition<TProjectContext = unknown> {
  name: string;
  platform: TestPlatform;
  setup?: ProjectSetupDefinition<TProjectContext>;
  files?: TestFileSelection;
  tags?: TestTagSelection;
  repeat?: number;
  retry?: number;
  variables?: Readonly<Record<string, JsonValue>>;
}

export interface ResolvedExecutionProject<TProjectContext = unknown> {
  readonly name: string;
  readonly platform: TestPlatform;
  readonly setup?: ProjectSetupDefinition<TProjectContext>;
  readonly files?: TestFileSelection;
  readonly tags: Readonly<Required<TestTagSelection>>;
  readonly repeat: number;
  readonly retry: number;
  readonly variables: Readonly<Record<string, JsonValue>>;
}

export interface ProjectSetupContext<TProjectContext = unknown> {
  readonly project: ResolvedExecutionProject<TProjectContext>;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly signal: AbortSignal;
  onTeardown(teardown: ProjectTeardown<TProjectContext>): void;
}

export interface ProjectTeardownContext<TProjectContext = unknown> {
  readonly project: ResolvedExecutionProject<TProjectContext>;
  readonly context: TProjectContext | undefined;
  readonly status: 'success' | 'failed';
  readonly setupError?: WorkflowError;
}

export type ProjectTeardown<TProjectContext = unknown> = (
  ctx: ProjectTeardownContext<TProjectContext>,
) => Awaitable<void>;

export interface ProjectSetupDefinition<TProjectContext = unknown> {
  name: string;
  platform?: TestPlatform | readonly TestPlatform[];
  setup(ctx: ProjectSetupContext<TProjectContext>): Awaitable<TProjectContext>;
}

export interface TestProjectDefinition<
  TProjectContext = undefined,
  TDocumentContext = TProjectContext,
> {
  root?: string;
  files?: TestFileSelection;
  projects?: readonly ExecutionProjectDefinition<TProjectContext>[];
  testRunner?: TestRunnerDefinition;
  output?: TestOutputDefinition;
  nodes: readonly NodeDefinition<any, any, TDocumentContext>[];
  setupDocument?: WorkflowDocumentSetup<TProjectContext, TDocumentContext>;
}

export interface LoadedTestProject<
  TProjectContext = undefined,
  TDocumentContext = TProjectContext,
> {
  root?: string;
  files?: TestFileSelection;
  projects: readonly ResolvedExecutionProject<TProjectContext>[];
  hasExplicitProjects: boolean;
  testRunner: ResolvedTestRunnerDefinition;
  output: ResolvedTestOutputDefinition;
  nodes: NodeRegistry;
  setupDocument?: WorkflowDocumentSetup<TProjectContext, TDocumentContext>;
  resolveNode(
    name: string,
  ): NodeDefinition<any, any, TDocumentContext> | undefined;
}

export const defineTestProject = <
  TProjectContext = undefined,
  TDocumentContext = TProjectContext,
>(
  definition: TestProjectDefinition<TProjectContext, TDocumentContext>,
): TestProjectDefinition<TProjectContext, TDocumentContext> => definition;

export const defineProjectSetup = <TProjectContext>(
  definition: ProjectSetupDefinition<TProjectContext>,
): ProjectSetupDefinition<TProjectContext> => definition;

const getDefaultExport = (loaded: unknown, absolutePath: string): unknown => {
  if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
    const defaultExport = (loaded as { default: unknown }).default;
    if (
      typeof defaultExport === 'object' &&
      defaultExport !== null &&
      '__esModule' in defaultExport
    ) {
      if ('default' in defaultExport) {
        return (defaultExport as { default: unknown }).default;
      }
      throw new TypeError(
        `Midscene config "${absolutePath}" must have a default export.`,
      );
    }
    return defaultExport;
  }
  throw new TypeError(
    `Midscene config "${absolutePath}" must have a default export.`,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAbsolutePattern = (pattern: string): boolean =>
  isAbsolute(pattern) ||
  /^[A-Za-z]:[\\/]/.test(pattern) ||
  pattern.startsWith('\\\\');

const validatePatterns = (
  value: unknown,
  field: 'include' | 'exclude',
  label = 'files',
  allowEmptyInclude = false,
): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Midscene config ${label}.${field} must be an array.`);
  }
  if (field === 'include' && value.length === 0 && !allowEmptyInclude) {
    throw new TypeError(
      `Midscene config ${label}.include must be a non-empty array.`,
    );
  }

  return value.map((pattern, index) => {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new TypeError(
        `Midscene config ${label}.${field}[${index}] must be a non-empty string.`,
      );
    }
    if (isAbsolutePattern(pattern)) {
      throw new TypeError(
        `Midscene config ${label}.${field}[${index}] must be relative to the project root.`,
      );
    }
    if (pattern.split(/[\\/]/).includes('..')) {
      throw new TypeError(
        `Midscene config ${label}.${field}[${index}] must not contain a ".." path segment.`,
      );
    }
    if (pattern.includes('\\')) {
      throw new TypeError(
        `Midscene config ${label}.${field}[${index}] must use POSIX path separators (/).`,
      );
    }
    if (pattern.startsWith('!')) {
      if (field === 'include') {
        throw new TypeError(
          `Midscene config ${label}.include[${index}] must not be a negated pattern. Use files.exclude instead.`,
        );
      }
      throw new TypeError(
        `Midscene config ${label}.exclude[${index}] must not be a negated pattern.`,
      );
    }
    return pattern;
  });
};

export const validateTestFileSelection = (
  value: unknown,
  label = 'files',
): TestFileSelection | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new TypeError(`Midscene config ${label} must be an object.`);
  }
  const include = validatePatterns(value.include, 'include', label);
  const exclude =
    value.exclude === undefined
      ? undefined
      : validatePatterns(value.exclude, 'exclude', label);
  return Object.freeze({
    include: Object.freeze(include),
    ...(exclude ? { exclude: Object.freeze(exclude) } : {}),
  });
};

const validateTagList = (
  value: unknown,
  field: 'include' | 'exclude',
  label: string,
): readonly string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`Midscene config ${label}.${field} must be an array.`);
  }
  return value.map((tag, index) => {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      throw new TypeError(
        `Midscene config ${label}.${field}[${index}] must be a non-empty string.`,
      );
    }
    return tag;
  });
};

const validateTagSelection = (
  value: unknown,
  label: string,
): Readonly<Required<TestTagSelection>> => {
  if (value === undefined) return Object.freeze({ include: [], exclude: [] });
  if (!isRecord(value)) {
    throw new TypeError(`Midscene config ${label} must be an object.`);
  }
  return Object.freeze({
    include: Object.freeze(validateTagList(value.include, 'include', label)),
    exclude: Object.freeze(validateTagList(value.exclude, 'exclude', label)),
  });
};

function assertJsonValue(
  value: unknown,
  path: string,
  seen: Set<unknown>,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError(`Midscene config ${path} must be JSON-compatible.`);
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError(`Midscene config ${path} must be JSON-compatible.`);
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError(`Midscene config ${path} must be JSON-compatible.`);
  }
  if (seen.has(value)) {
    throw new TypeError(`Midscene config ${path} must not contain cycles.`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, seen),
    );
  } else {
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

const deepFreezeJson = <T extends JsonValue>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
};

const validateVariables = (
  value: unknown,
  label: string,
): Readonly<Record<string, JsonValue>> => {
  if (value === undefined) return Object.freeze({});
  if (!isRecord(value)) {
    throw new TypeError(`Midscene config ${label} must be an object.`);
  }
  assertJsonValue(value, label, new Set());
  return deepFreezeJson(value as Record<string, JsonValue>);
};

const platforms = new Set<TestPlatform>(['web', 'android', 'ios', 'computer']);

const validatePlatform = (value: unknown, label: string): TestPlatform => {
  if (typeof value !== 'string' || !platforms.has(value as TestPlatform)) {
    throw new TypeError(
      `Midscene config ${label} must be one of web, android, ios, computer.`,
    );
  }
  return value as TestPlatform;
};

const validateProjectSetup = <TProjectContext>(
  value: unknown,
  projectPlatform: TestPlatform,
  label: string,
): ProjectSetupDefinition<TProjectContext> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new TypeError(`Midscene config ${label} must be an object.`);
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new TypeError(`Midscene config ${label}.name must be non-empty.`);
  }
  if (typeof value.setup !== 'function') {
    throw new TypeError(`Midscene config ${label}.setup must be a function.`);
  }
  const supported =
    value.platform === undefined
      ? undefined
      : Array.isArray(value.platform)
        ? value.platform.map((item, index) =>
            validatePlatform(item, `${label}.platform[${index}]`),
          )
        : [validatePlatform(value.platform, `${label}.platform`)];
  if (supported && !supported.includes(projectPlatform)) {
    throw new TypeError(
      `Midscene config ${label} does not support project platform "${projectPlatform}".`,
    );
  }
  return value as unknown as ProjectSetupDefinition<TProjectContext>;
};

const validatePositiveInteger = (
  value: unknown,
  fallback: number,
  label: string,
): number => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`Midscene config ${label} must be a positive integer.`);
  }
  return value as number;
};

const validateNonNegativeInteger = (
  value: unknown,
  fallback: number,
  label: string,
): number => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(
      `Midscene config ${label} must be a non-negative integer.`,
    );
  }
  return value as number;
};

const validateExecutionProjects = <TProjectContext>(
  value: unknown,
  defaultFiles: TestFileSelection | undefined,
): {
  projects: readonly ResolvedExecutionProject<TProjectContext>[];
  hasExplicitProjects: boolean;
} => {
  if (value === undefined) {
    return {
      hasExplicitProjects: false,
      projects: Object.freeze([
        Object.freeze({
          name: 'default',
          platform: 'web' as const,
          ...(defaultFiles ? { files: defaultFiles } : {}),
          tags: Object.freeze({ include: [], exclude: [] }),
          repeat: 1,
          retry: 0,
          variables: Object.freeze({}),
        }),
      ]),
    };
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      'Midscene config projects must be a non-empty array when declared.',
    );
  }
  const names = new Set<string>();
  const projects = value.map((candidate, index) => {
    const label = `projects[${index}]`;
    if (!isRecord(candidate)) {
      throw new TypeError(`Midscene config ${label} must be an object.`);
    }
    if (
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0
    ) {
      throw new TypeError(`Midscene config ${label}.name must be non-empty.`);
    }
    if (names.has(candidate.name)) {
      throw new TypeError(
        `Midscene config project name "${candidate.name}" must be unique.`,
      );
    }
    names.add(candidate.name);
    const platform = validatePlatform(candidate.platform, `${label}.platform`);
    const files =
      candidate.files === undefined
        ? defaultFiles
        : validateTestFileSelection(candidate.files, `${label}.files`);
    return Object.freeze({
      name: candidate.name,
      platform,
      ...(files ? { files } : {}),
      tags: validateTagSelection(candidate.tags, `${label}.tags`),
      repeat: validatePositiveInteger(candidate.repeat, 1, `${label}.repeat`),
      retry: validateNonNegativeInteger(candidate.retry, 0, `${label}.retry`),
      variables: validateVariables(candidate.variables, `${label}.variables`),
      ...(candidate.setup === undefined
        ? {}
        : {
            setup: validateProjectSetup<TProjectContext>(
              candidate.setup,
              platform,
              `${label}.setup`,
            )!,
          }),
    });
  });
  return { projects: Object.freeze(projects), hasExplicitProjects: true };
};

const validateTestRunner = (value: unknown): ResolvedTestRunnerDefinition => {
  if (value !== undefined && !isRecord(value)) {
    throw new TypeError('Midscene config testRunner must be an object.');
  }
  const candidate = value ?? {};
  const maxConcurrency = (candidate as Record<string, unknown>).maxConcurrency;
  if (maxConcurrency !== undefined && maxConcurrency !== 1) {
    throw new TypeError(
      'Midscene config testRunner.maxConcurrency currently only supports 1.',
    );
  }
  return Object.freeze({
    maxConcurrency: 1,
    bail: validateNonNegativeInteger(
      (candidate as Record<string, unknown>).bail,
      0,
      'testRunner.bail',
    ),
    testTimeout: validatePositiveInteger(
      (candidate as Record<string, unknown>).testTimeout,
      120_000,
      'testRunner.testTimeout',
    ),
  });
};

const validateOutputPath = (
  value: unknown,
  fallback: string,
  label: string,
): string => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Midscene config ${label} must be non-empty.`);
  }
  return value;
};

const validateOutput = (value: unknown): ResolvedTestOutputDefinition => {
  if (value !== undefined && !isRecord(value)) {
    throw new TypeError('Midscene config output must be an object.');
  }
  const candidate = (value ?? {}) as Record<string, unknown>;
  return Object.freeze({
    summary: validateOutputPath(
      candidate.summary,
      './midscene_run/output/summary.json',
      'output.summary',
    ),
    reportDir: validateOutputPath(
      candidate.reportDir,
      './midscene_run/report',
      'output.reportDir',
    ),
  });
};

const validateTestProjectDefinition = <TProjectContext, TDocumentContext>(
  definition: unknown,
): LoadedTestProject<TProjectContext, TDocumentContext> => {
  if (
    !isRecord(definition) ||
    !('nodes' in definition) ||
    !Array.isArray(definition.nodes)
  ) {
    throw new TypeError(
      'Midscene config must default export an object with a nodes array.',
    );
  }
  if ('setupWorkflow' in definition) {
    throw new TypeError(
      'Midscene config setupWorkflow is no longer supported. Use setupDocument instead.',
    );
  }
  if (
    definition.root !== undefined &&
    (typeof definition.root !== 'string' || definition.root.trim().length === 0)
  ) {
    throw new TypeError('Midscene config root must be a non-empty string.');
  }
  const files = validateTestFileSelection(definition.files);
  if (
    definition.setupDocument !== undefined &&
    typeof definition.setupDocument !== 'function'
  ) {
    throw new TypeError('Midscene config setupDocument must be a function.');
  }
  const resolvedProjects = validateExecutionProjects<TProjectContext>(
    definition.projects,
    files,
  );
  const nodes = new NodeRegistry(definition.nodes as NodeDefinition[]);
  return {
    ...(definition.root ? { root: definition.root } : {}),
    ...(files ? { files } : {}),
    ...resolvedProjects,
    testRunner: validateTestRunner(definition.testRunner),
    output: validateOutput(definition.output),
    nodes,
    ...(definition.setupDocument
      ? {
          setupDocument: definition.setupDocument as WorkflowDocumentSetup<
            TProjectContext,
            TDocumentContext
          >,
        }
      : {}),
    resolveNode: (name) =>
      nodes.get(name) as NodeDefinition<any, any, TDocumentContext> | undefined,
  };
};

const assertTypeScriptConfig = (absolutePath: string): void => {
  if (!absolutePath.endsWith('.ts')) {
    const extension = absolutePath.match(/(\.[^./\\]+)$/)?.[1] ?? '(none)';
    throw new TypeError(
      `Unsupported Midscene config extension: ${extension}. Supported extension: .ts.`,
    );
  }
};

const canRetryWithCjsLoader = (error: unknown): error is SyntaxError =>
  error instanceof SyntaxError &&
  (/^Unexpected (?:identifier|reserved word|token)/.test(error.message) ||
    (error as SyntaxError & { code?: string }).code ===
      'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX');

export async function loadTestProject<
  TProjectContext = undefined,
  TDocumentContext = TProjectContext,
>(
  configPath?: string,
): Promise<LoadedTestProject<TProjectContext, TDocumentContext>> {
  if (!configPath) {
    return validateTestProjectDefinition<TProjectContext, TDocumentContext>({
      nodes: [],
    });
  }

  const absolutePath = resolve(configPath);
  assertTypeScriptConfig(absolutePath);
  let loaded: unknown;
  try {
    loaded = await tsImport(absolutePath, {
      parentURL: pathToFileURL(`${dirname(absolutePath)}${sep}`).href,
      tsconfig: false,
    });
  } catch (error) {
    try {
      if (!canRetryWithCjsLoader(error)) throw error;
      loaded = tsxRequire(absolutePath, pathToFileURL(absolutePath));
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error ? `: ${fallbackError.message}` : '';
      throw new Error(
        `Failed to load Midscene config "${absolutePath}"${message}`,
        { cause: fallbackError },
      );
    }
  }

  return validateTestProjectDefinition<TProjectContext, TDocumentContext>(
    getDefaultExport(loaded, absolutePath),
  );
}
