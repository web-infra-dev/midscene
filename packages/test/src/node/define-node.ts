import { defineNode as coreDefineNode } from '@midscene/core/internal/test-runner';
import type {
  DefineNodeOptions,
  DefineNodeWithSchemaOptions,
  NodeDefinition,
  NodeDefinitionWithSchema,
  NodeInputSchema,
} from './types';

// A type-only facade: validation and execution still belong to the shared kernel.
interface DefineNativeNode {
  <TSchema extends NodeInputSchema, TData = unknown, TContext = unknown>(
    options: DefineNodeWithSchemaOptions<TSchema, TData, TContext>,
  ): NodeDefinitionWithSchema<TSchema, TData, TContext>;
  <TInput = unknown, TData = unknown, TContext = unknown>(
    options: DefineNodeOptions<TInput, TData, TContext>,
  ): NodeDefinition<TInput, TData, TContext>;
}
export const defineNode: DefineNativeNode = coreDefineNode;
