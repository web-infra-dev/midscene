import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { NodeRegistry } from '../engine/registry';
import type { NodeDefinition } from '../node/types';

export interface WorkflowProjectDefinition {
  nodes: readonly NodeDefinition<any, any>[];
}

export interface LoadedWorkflowProject {
  nodes: NodeRegistry;
  resolveNode(name: string): NodeDefinition<any, any> | undefined;
}

export const defineWorkflowProject = (
  definition: WorkflowProjectDefinition,
): WorkflowProjectDefinition => definition;

const unwrapProjectDefinition = (loaded: unknown): unknown => {
  if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
    return (loaded as { default: unknown }).default;
  }
  return loaded;
};

export function loadWorkflowProjectSync(
  configPath?: string,
): LoadedWorkflowProject {
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

  const nodes = new NodeRegistry(
    (definition as WorkflowProjectDefinition).nodes,
  );
  return {
    nodes,
    resolveNode: (name) => nodes.get(name),
  };
}
