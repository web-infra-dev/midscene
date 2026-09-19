import { NodeRegistry as CoreNodeRegistry } from '@midscene/core/internal/test-runner';
import type { NodeDefinition } from '../node/types';

export type NodeRegistry = Omit<
  CoreNodeRegistry,
  'get' | 'require' | 'register' | 'definitions'
> & {
  get(name: string): NodeDefinition<any, any> | undefined;
  require(name: string): NodeDefinition<any, any>;
  register<TInput, TData>(node: NodeDefinition<TInput, TData>): NodeRegistry;
  definitions(): readonly NodeDefinition<any, any, any>[];
};
export const NodeRegistry: {
  new (nodes?: readonly NodeDefinition<any, any>[]): NodeRegistry;
} = CoreNodeRegistry;
