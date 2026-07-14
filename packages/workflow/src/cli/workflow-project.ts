import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { NodeRegistry } from '../engine/registry';
import type { WorkflowSetup } from '../engine/types';
import type { NodeDefinition } from '../node/types';

export interface WorkflowProjectDefinition<TContext = undefined> {
  nodes: readonly NodeDefinition<any, any, TContext>[];
  setupWorkflow?: WorkflowSetup<TContext>;
}

export interface LoadedWorkflowProject<TContext = undefined> {
  nodes: NodeRegistry;
  setupWorkflow?: WorkflowSetup<TContext>;
  resolveNode(name: string): NodeDefinition<any, any, TContext> | undefined;
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
  if (
    projectDefinition.setupWorkflow !== undefined &&
    typeof projectDefinition.setupWorkflow !== 'function'
  ) {
    throw new TypeError('Workflow config setupWorkflow must be a function.');
  }

  const nodes = new NodeRegistry(projectDefinition.nodes);
  return {
    nodes,
    ...(projectDefinition.setupWorkflow
      ? { setupWorkflow: projectDefinition.setupWorkflow }
      : {}),
    resolveNode: (name) =>
      nodes.get(name) as NodeDefinition<any, any, TContext> | undefined,
  };
}
