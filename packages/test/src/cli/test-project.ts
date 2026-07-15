import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { NodeRegistry } from '../engine/registry';
import type { WorkflowDocumentSetup } from '../engine/types';
import type { NodeDefinition } from '../node/types';

export interface TestFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface TestProjectDefinition<TContext = undefined> {
  root?: string;
  files?: TestFileSelection;
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}

export interface LoadedTestProject<TContext = undefined> {
  root?: string;
  files?: TestFileSelection;
  nodes: NodeRegistry;
  setupDocument?: WorkflowDocumentSetup<TContext>;
  resolveNode(name: string): NodeDefinition<any, any, TContext> | undefined;
}

export const defineTestProject = <TContext = undefined>(
  definition: TestProjectDefinition<TContext>,
): TestProjectDefinition<TContext> => definition;

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

const isAbsolutePattern = (pattern: string): boolean =>
  isAbsolute(pattern) ||
  /^[A-Za-z]:[\\/]/.test(pattern) ||
  pattern.startsWith('\\\\');

const validatePatterns = (
  value: unknown,
  field: 'include' | 'exclude',
): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Midscene config files.${field} must be an array.`);
  }
  if (field === 'include' && value.length === 0) {
    throw new TypeError(
      'Midscene config files.include must be a non-empty array.',
    );
  }

  return value.map((pattern, index) => {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new TypeError(
        `Midscene config files.${field}[${index}] must be a non-empty string.`,
      );
    }
    if (isAbsolutePattern(pattern)) {
      throw new TypeError(
        `Midscene config files.${field}[${index}] must be relative to the project root.`,
      );
    }
    if (pattern.split(/[\\/]/).includes('..')) {
      throw new TypeError(
        `Midscene config files.${field}[${index}] must not contain a ".." path segment.`,
      );
    }
    if (pattern.includes('\\')) {
      throw new TypeError(
        `Midscene config files.${field}[${index}] must use POSIX path separators (/).`,
      );
    }
    if (pattern.startsWith('!')) {
      if (field === 'include') {
        throw new TypeError(
          `Midscene config files.include[${index}] must not be a negated pattern. Use files.exclude instead.`,
        );
      }
      throw new TypeError(
        `Midscene config files.exclude[${index}] must not be a negated pattern.`,
      );
    }
    return pattern;
  });
};

export const validateTestFileSelection = (
  value: unknown,
): TestFileSelection | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Midscene config files must be an object.');
  }

  const files = value as { include?: unknown; exclude?: unknown };
  const include = validatePatterns(files.include, 'include');
  const exclude =
    files.exclude === undefined
      ? undefined
      : validatePatterns(files.exclude, 'exclude');
  return {
    include,
    ...(exclude ? { exclude } : {}),
  };
};

const validateTestProjectDefinition = <TContext>(
  definition: unknown,
): LoadedTestProject<TContext> => {
  if (
    typeof definition !== 'object' ||
    definition === null ||
    !('nodes' in definition) ||
    !Array.isArray((definition as { nodes: unknown }).nodes)
  ) {
    throw new TypeError(
      'Midscene config must default export an object with a nodes array.',
    );
  }

  const projectDefinition = definition as TestProjectDefinition<TContext>;
  if ('setupWorkflow' in definition) {
    throw new TypeError(
      'Midscene config setupWorkflow is no longer supported. Use setupDocument instead.',
    );
  }
  if (
    projectDefinition.root !== undefined &&
    (typeof projectDefinition.root !== 'string' ||
      projectDefinition.root.trim().length === 0)
  ) {
    throw new TypeError('Midscene config root must be a non-empty string.');
  }
  const files = validateTestFileSelection(projectDefinition.files);
  if (
    projectDefinition.setupDocument !== undefined &&
    typeof projectDefinition.setupDocument !== 'function'
  ) {
    throw new TypeError('Midscene config setupDocument must be a function.');
  }

  const nodes = new NodeRegistry(projectDefinition.nodes);
  return {
    ...(projectDefinition.root ? { root: projectDefinition.root } : {}),
    ...(files ? { files } : {}),
    nodes,
    ...(projectDefinition.setupDocument
      ? { setupDocument: projectDefinition.setupDocument }
      : {}),
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

export async function loadTestProject<TContext = undefined>(
  configPath?: string,
): Promise<LoadedTestProject<TContext>> {
  if (!configPath) {
    return validateTestProjectDefinition<TContext>({ nodes: [] });
  }

  const absolutePath = resolve(configPath);
  assertTypeScriptConfig(absolutePath);
  let loaded: unknown;
  try {
    const configUrl = pathToFileURL(absolutePath).href;
    loaded = await tsImport(absolutePath, {
      parentURL: configUrl,
      tsconfig: false,
    });
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(
      `Failed to load Midscene config "${absolutePath}"${message}`,
      { cause: error },
    );
  }

  return validateTestProjectDefinition<TContext>(
    getDefaultExport(loaded, absolutePath),
  );
}
