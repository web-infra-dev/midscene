import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { DocumentNodeRegistry, NodeRegistry } from '../engine/registry';
import type { WorkflowDocumentSetup } from '../engine/types';
import type { DocumentNodeDefinition, NodeDefinition } from '../node/types';

export interface WorkflowProjectDefinition<TContext = undefined> {
  nodes: readonly NodeDefinition<any, any, TContext>[];
  documentNodes?: readonly DocumentNodeDefinition<any, any, TContext>[];
  setupDocument?: WorkflowDocumentSetup<TContext>;
}

export interface LoadedWorkflowProject<TContext = undefined> {
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
        `Failed to load workflow config "${absolutePath}". Use a CommonJS config (.cjs) for synchronous Rstest collection.`,
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
