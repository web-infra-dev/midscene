import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { require as tsxRequire } from 'tsx/cjs/api';
import { tsImport } from 'tsx/esm/api';
import { NodeRegistry } from '../engine/registry';
import type { NodeDefinition } from '../node/types';
import type { CreateYamlPlayerOptions } from '../runtime/create-yaml-player';

import type {
  DocumentSetupDefinition,
  ExecutionProjectDefinition,
  JsonValue,
  ProjectSetupDefinition,
  ResolvedExecutionProject,
  TestFileSelection,
  TestTagSelection,
} from '@midscene/core/internal/test-runner';
export type {
  DocumentSetupDefinition,
  ExecutionProjectDefinition,
  JsonPrimitive,
  JsonValue,
  DocumentSetupContext,
  ProjectSetupContext,
  ProjectSetupDefinition,
  ProjectTeardown,
  ProjectTeardownContext,
  ResolvedExecutionProject,
  TestFileSelection,
  TestTagSelection,
} from '@midscene/core/internal/test-runner';

export interface TestOptions {
  maxConcurrency?: number;
  bail?: number;
  testTimeout?: number;
}

export interface ResolvedTestOptions {
  maxConcurrency: number;
  bail: number;
  testTimeout: number;
}

export interface TestOutputDefinition {
  reportDir?: string;
}

export interface ResolvedTestOutputDefinition {
  reportDir: string;
}

const projectIdFromIndex = (index: number): string => `project-${index}`;

export interface LegacyWorkflowOptions<TContext = undefined> {
  /** Explicitly share setup-owned resources with legacy YAML documents. */
  getOptions(
    context: TContext | undefined,
  ): CreateYamlPlayerOptions | Promise<CreateYamlPlayerOptions>;
}

export interface TestProjectDefinition<TContext = undefined> {
  legacy?: LegacyWorkflowOptions<TContext>;
  setup?: ProjectSetupDefinition<TContext>;
  documentSetup?: DocumentSetupDefinition<TContext>;
  projects?: readonly ExecutionProjectDefinition<TContext>[];
  test?: TestOptions;
  output?: TestOutputDefinition;
  nodes?: readonly NodeDefinition<any, any, TContext>[];
}

export interface LoadedExecutionProject<TProjectContext = unknown>
  extends ResolvedExecutionProject<TProjectContext> {
  /** Effective Nodes: globals plus project-local overrides. */
  readonly nodes: NodeRegistry;
}

export interface LoadedTestProject<TContext = undefined> {
  legacy?: LegacyWorkflowOptions<TContext>;
  projects: readonly LoadedExecutionProject<TContext>[];
  hasExplicitProjects: boolean;
  /** Legacy files retain their own action timeouts unless explicitly overridden. */
  hasExplicitTestTimeout: boolean;
  test: ResolvedTestOptions;
  output: ResolvedTestOutputDefinition;
  nodes: NodeRegistry;
  resolveNode(name: string): NodeDefinition<any, any, TContext> | undefined;
}

export const defineTestProject = <TContext = undefined>(
  definition: TestProjectDefinition<TContext>,
): TestProjectDefinition<TContext> => definition;

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

const rejectUnknownKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void => {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new TypeError(
      `Midscene config ${label}.${unknown} is not supported.`,
    );
  }
};

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
  rejectUnknownKeys(value, ['include', 'exclude', 'order'], label);
  if (
    value.order !== undefined &&
    value.order !== 'sorted' &&
    value.order !== 'listed'
  ) {
    throw new TypeError(
      `Midscene config ${label}.order must be sorted or listed.`,
    );
  }
  const include = validatePatterns(value.include, 'include', label);
  const exclude =
    value.exclude === undefined
      ? undefined
      : validatePatterns(value.exclude, 'exclude', label);
  return Object.freeze({
    include: Object.freeze(include),
    ...(exclude ? { exclude: Object.freeze(exclude) } : {}),
    ...(value.order ? { order: value.order as 'sorted' | 'listed' } : {}),
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

const validateSetup = <TSetup>(
  value: unknown,
  label: string,
): TSetup | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new TypeError(`Midscene config ${label} must be an object.`);
  }
  rejectUnknownKeys(value, ['name', 'setup', 'onDocumentResult'], label);
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new TypeError(`Midscene config ${label}.name must be non-empty.`);
  }
  if (typeof value.setup !== 'function') {
    throw new TypeError(`Midscene config ${label}.setup must be a function.`);
  }
  if (
    value.onDocumentResult !== undefined &&
    typeof value.onDocumentResult !== 'function'
  ) {
    throw new TypeError(
      `Midscene config ${label}.onDocumentResult must be a function.`,
    );
  }
  return value as unknown as TSetup;
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
  defaultSetup: unknown,
  defaultDocumentSetup: unknown,
  globalNodes: NodeRegistry,
): {
  projects: readonly LoadedExecutionProject<TProjectContext>[];
  hasExplicitProjects: boolean;
} => {
  if (value === undefined) {
    const setup = validateSetup<ProjectSetupDefinition<TProjectContext>>(
      defaultSetup,
      'setup',
    );
    const documentSetup = validateSetup<
      DocumentSetupDefinition<TProjectContext>
    >(defaultDocumentSetup, 'documentSetup');
    return {
      hasExplicitProjects: false,
      projects: Object.freeze([
        Object.freeze({
          projectId: projectIdFromIndex(0),
          name: 'default',
          ...(setup ? { setup } : {}),
          ...(documentSetup ? { documentSetup } : {}),
          tags: Object.freeze({ include: [], exclude: [] }),
          retry: 0,
          variables: Object.freeze({}),
          nodes: new NodeRegistry(globalNodes.definitions()),
        }),
      ]),
    };
  }
  if (defaultDocumentSetup !== undefined) {
    throw new TypeError(
      'Midscene config documentSetup cannot be used together with projects. Move documentSetup to projects[].documentSetup.',
    );
  }
  if (defaultSetup !== undefined) {
    throw new TypeError(
      'Midscene config setup cannot be used together with projects. Move setup to projects[].setup.',
    );
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
    rejectUnknownKeys(
      candidate,
      [
        'name',
        'setup',
        'nodes',
        'documentSetup',
        'files',
        'tags',
        'retry',
        'retryScope',
        'fileConcurrency',
        'setupFile',
        'variables',
      ],
      label,
    );
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
    const files = validateTestFileSelection(candidate.files, `${label}.files`);
    if (candidate.nodes !== undefined && !Array.isArray(candidate.nodes)) {
      throw new TypeError(`Midscene config ${label}.nodes must be an array.`);
    }
    const localNodes = new NodeRegistry(
      candidate.nodes as NodeDefinition[] | undefined,
    );
    const nodes = new NodeRegistry([
      ...globalNodes.definitions().filter((node) => !localNodes.has(node.name)),
      ...localNodes.definitions(),
    ]);
    if (
      candidate.retryScope !== undefined &&
      candidate.retryScope !== 'case' &&
      candidate.retryScope !== 'document'
    ) {
      throw new TypeError(
        `Midscene config ${label}.retryScope must be case or document.`,
      );
    }
    if (candidate.setupFile !== undefined) {
      validatePatterns([candidate.setupFile], 'include', `${label}.setupFile`);
    }
    return Object.freeze({
      projectId: projectIdFromIndex(index),
      name: candidate.name,
      nodes,
      ...(files ? { files } : {}),
      tags: validateTagSelection(candidate.tags, `${label}.tags`),
      retry: validateNonNegativeInteger(candidate.retry, 0, `${label}.retry`),
      retryScope: (candidate.retryScope ?? 'case') as 'case' | 'document',
      fileConcurrency: validatePositiveInteger(
        candidate.fileConcurrency,
        1,
        `${label}.fileConcurrency`,
      ),
      ...(candidate.setupFile
        ? { setupFile: candidate.setupFile as string }
        : {}),
      variables: validateVariables(candidate.variables, `${label}.variables`),
      ...(candidate.documentSetup === undefined
        ? {}
        : {
            documentSetup: validateSetup<
              DocumentSetupDefinition<TProjectContext>
            >(candidate.documentSetup, `${label}.documentSetup`)!,
          }),
      ...(candidate.setup === undefined
        ? {}
        : {
            setup: validateSetup<ProjectSetupDefinition<TProjectContext>>(
              candidate.setup,
              `${label}.setup`,
            )!,
          }),
    });
  });
  return { projects: Object.freeze(projects), hasExplicitProjects: true };
};

const validateTestOptions = (value: unknown): ResolvedTestOptions => {
  if (value !== undefined && !isRecord(value)) {
    throw new TypeError('Midscene config test must be an object.');
  }
  const candidate = value ?? {};
  return Object.freeze({
    maxConcurrency: validatePositiveInteger(
      (candidate as Record<string, unknown>).maxConcurrency,
      1,
      'test.maxConcurrency',
    ),
    bail: validateNonNegativeInteger(
      (candidate as Record<string, unknown>).bail,
      0,
      'test.bail',
    ),
    testTimeout: validatePositiveInteger(
      (candidate as Record<string, unknown>).testTimeout,
      120_000,
      'test.testTimeout',
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
  rejectUnknownKeys(candidate, ['reportDir'], 'output');
  return Object.freeze({
    reportDir: validateOutputPath(
      candidate.reportDir,
      './midscene_run/report',
      'output.reportDir',
    ),
  });
};

const validateTestProjectDefinition = <TContext>(
  definition: unknown,
): LoadedTestProject<TContext> => {
  if (!isRecord(definition)) {
    throw new TypeError('Midscene config must default export an object.');
  }
  if (definition.nodes !== undefined && !Array.isArray(definition.nodes)) {
    throw new TypeError('Midscene config nodes must be an array.');
  }
  if ('setupWorkflow' in definition) {
    throw new TypeError(
      'Midscene config setupWorkflow is no longer supported. Use setup or projects[].setup instead.',
    );
  }
  if ('setupDocument' in definition) {
    throw new TypeError(
      'Midscene config setupDocument is not supported. Use setup or projects[].setup for resources, and beforeAll/afterAll for document lifecycle steps.',
    );
  }
  if ('root' in definition) {
    throw new TypeError(
      'Midscene config root is not supported. Pass the Test Project directory to midscene-test instead.',
    );
  }
  if ('files' in definition) {
    throw new TypeError(
      'Midscene config files is not supported at the root. Move it to projects[].files.',
    );
  }
  if ('testRunner' in definition) {
    throw new TypeError(
      'Midscene config testRunner is not supported. Rename it to test.',
    );
  }
  rejectUnknownKeys(
    definition,
    ['setup', 'documentSetup', 'projects', 'test', 'output', 'nodes', 'legacy'],
    'root',
  );
  if (definition.legacy !== undefined) {
    if (
      !isRecord(definition.legacy) ||
      typeof definition.legacy.getOptions !== 'function'
    ) {
      throw new TypeError(
        'Midscene config legacy.getOptions must be a function.',
      );
    }
    rejectUnknownKeys(definition.legacy, ['getOptions'], 'legacy');
  }
  const nodes = new NodeRegistry(
    definition.nodes as NodeDefinition[] | undefined,
  );
  const resolvedProjects = validateExecutionProjects<TContext>(
    definition.projects,
    definition.setup,
    definition.documentSetup,
    nodes,
  );
  return {
    ...resolvedProjects,
    legacy: definition.legacy as LegacyWorkflowOptions<TContext> | undefined,
    test: validateTestOptions(definition.test),
    hasExplicitTestTimeout:
      isRecord(definition.test) && definition.test.testTimeout !== undefined,
    output: validateOutput(definition.output),
    nodes,
    resolveNode: (name) =>
      nodes.get(name) as NodeDefinition<any, any, TContext> | undefined,
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

const canRetryWithCjsLoader = (error: unknown): error is Error => {
  if (!(error instanceof Error)) return false;
  const errorCode = (error as Error & { code?: string }).code;
  return (
    (error instanceof SyntaxError &&
      /^Unexpected (?:identifier|reserved word|token)/.test(error.message)) ||
    errorCode === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' ||
    (errorCode === 'ERR_UNKNOWN_FILE_EXTENSION' &&
      /^Unknown file extension\b/.test(error.message))
  );
};

export async function loadTestProject<TContext = undefined>(
  configPath?: string,
): Promise<LoadedTestProject<TContext>> {
  if (!configPath) {
    return validateTestProjectDefinition<TContext>({
      nodes: [],
    });
  }

  const absolutePath = resolve(configPath);
  assertTypeScriptConfig(absolutePath);
  let loaded: unknown;
  try {
    loaded = await tsImport(pathToFileURL(absolutePath).href, {
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

  return validateTestProjectDefinition<TContext>(
    getDefaultExport(loaded, absolutePath),
  );
}
