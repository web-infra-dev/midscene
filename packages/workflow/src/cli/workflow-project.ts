import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { DocumentNodeRegistry, NodeRegistry } from '../engine/registry';
import type { WorkflowDocumentSetup } from '../engine/types';
import type { DocumentNodeDefinition, NodeDefinition } from '../node/types';

export interface WorkflowFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface WorkflowProjectDefinition<TContext = undefined> {
  root?: string;
  files?: WorkflowFileSelection;
  nodes: readonly NodeDefinition<any, any, TContext>[];
  documentNodes?: readonly DocumentNodeDefinition<any, any, TContext>[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}

export interface LoadedWorkflowProject<TContext = undefined> {
  root?: string;
  files?: WorkflowFileSelection;
  nodes: NodeRegistry;
  documentNodes: DocumentNodeRegistry;
  setupDocument?: WorkflowDocumentSetup<TContext>;
  resolveNode(name: string): NodeDefinition<any, any, TContext> | undefined;
  resolveDocumentNode(
    name: string,
  ): DocumentNodeDefinition<any, any, TContext> | undefined;
}

export const defineWorkflowProject = <TContext = undefined>(
  definition: WorkflowProjectDefinition<TContext>,
): WorkflowProjectDefinition<TContext> => definition;

const unwrapProjectDefinition = (loaded: unknown): unknown => {
  if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
    return (loaded as { default: unknown }).default;
  }
  return loaded;
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
    throw new TypeError(`Workflow config files.${field} must be an array.`);
  }
  if (field === 'include' && value.length === 0) {
    throw new TypeError(
      'Workflow config files.include must be a non-empty array.',
    );
  }

  return value.map((pattern, index) => {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      throw new TypeError(
        `Workflow config files.${field}[${index}] must be a non-empty string.`,
      );
    }
    if (isAbsolutePattern(pattern)) {
      throw new TypeError(
        `Workflow config files.${field}[${index}] must be relative to the project root.`,
      );
    }
    if (pattern.split(/[\\/]/).includes('..')) {
      throw new TypeError(
        `Workflow config files.${field}[${index}] must not contain a ".." path segment.`,
      );
    }
    if (pattern.includes('\\')) {
      throw new TypeError(
        `Workflow config files.${field}[${index}] must use POSIX path separators (/).`,
      );
    }
    if (pattern.startsWith('!')) {
      if (field === 'include') {
        throw new TypeError(
          `Workflow config files.include[${index}] must not be a negated pattern. Use files.exclude instead.`,
        );
      }
      throw new TypeError(
        `Workflow config files.exclude[${index}] must not be a negated pattern.`,
      );
    }
    return pattern;
  });
};

export const validateWorkflowFileSelection = (
  value: unknown,
): WorkflowFileSelection | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Workflow config files must be an object.');
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

export function loadWorkflowProjectSync<TContext = undefined>(
  configPath?: string,
): LoadedWorkflowProject<TContext> {
  let definition: unknown = { nodes: [] };
  if (configPath) {
    const absolutePath = resolve(configPath);
    try {
      definition = unwrapProjectDefinition(
        createRequire(absolutePath)(absolutePath),
      );
    } catch (error) {
      throw new Error(
        `Failed to load workflow config "${absolutePath}". Use a CommonJS config (.cjs).`,
        { cause: error },
      );
    }
  }

  if (
    typeof definition !== 'object' ||
    definition === null ||
    !('nodes' in definition) ||
    !Array.isArray((definition as { nodes: unknown }).nodes)
  ) {
    throw new TypeError(
      'Workflow config must export an object with a nodes array.',
    );
  }

  const projectDefinition = definition as WorkflowProjectDefinition<TContext>;
  if ('setupWorkflow' in definition) {
    throw new TypeError(
      'Workflow config setupWorkflow is no longer supported. Use setupDocument instead.',
    );
  }
  if (
    projectDefinition.root !== undefined &&
    (typeof projectDefinition.root !== 'string' ||
      projectDefinition.root.trim().length === 0)
  ) {
    throw new TypeError('Workflow config root must be a non-empty string.');
  }
  const files = validateWorkflowFileSelection(projectDefinition.files);
  if (
    projectDefinition.documentNodes !== undefined &&
    !Array.isArray(projectDefinition.documentNodes)
  ) {
    throw new TypeError('Workflow config documentNodes must be an array.');
  }
  if (
    projectDefinition.setupDocument !== undefined &&
    typeof projectDefinition.setupDocument !== 'function'
  ) {
    throw new TypeError('Workflow config setupDocument must be a function.');
  }

  const nodes = new NodeRegistry(projectDefinition.nodes);
  const documentNodes = new DocumentNodeRegistry(
    projectDefinition.documentNodes,
  );
  return {
    ...(projectDefinition.root ? { root: projectDefinition.root } : {}),
    ...(files ? { files } : {}),
    nodes,
    documentNodes,
    ...(projectDefinition.setupDocument
      ? { setupDocument: projectDefinition.setupDocument }
      : {}),
    resolveNode: (name) =>
      nodes.get(name) as NodeDefinition<any, any, TContext> | undefined,
    resolveDocumentNode: (name) =>
      documentNodes.get(name) as
        | DocumentNodeDefinition<any, any, TContext>
        | undefined,
  };
}
