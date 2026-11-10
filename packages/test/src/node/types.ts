export type {
  NodeResult,
  NodeReportTrace,
  NodeReportCollector,
  NodeExecutionReturn,
  NodeInputSchema,
} from '@midscene/core/internal/test-runner';

import type * as Core from '@midscene/core/internal/test-runner';
import type { z } from 'zod/v4';
import type { NodeScopeTeardown } from '../engine/types';
import type { NormalizedStepMeta } from '../parser/types';

type NativeNodeContext<T> = T extends unknown
  ? Omit<T, '$' | 'onTeardown'> & {
      $: Readonly<NormalizedStepMeta>;
      onTeardown(teardown: NodeScopeTeardown): void;
    }
  : never;
export type NodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> = NativeNodeContext<Core.NodeExecutionContext<TInput, TContext>>;
export type DefineNodeOptions<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> = Omit<Core.DefineNodeOptions<TInput, TData, TContext>, 'execute'> & {
  execute(
    ctx: NodeExecutionContext<TInput, TContext>,
  ): Core.NodeExecutionReturn<TData>;
};
export type NodeDefinition<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> = DefineNodeOptions<TInput, TData, TContext>;
export type DefineNodeWithSchemaOptions<
  TSchema extends Core.NodeInputSchema,
  TData = unknown,
  TContext = unknown,
> = Omit<
  DefineNodeOptions<z.output<TSchema>, TData, TContext>,
  'inputSchema'
> & { inputSchema: TSchema };
export type NodeDefinitionWithSchema<
  TSchema extends Core.NodeInputSchema,
  TData = unknown,
  TContext = unknown,
> = NodeDefinition<z.output<TSchema>, TData, TContext> & {
  inputSchema: TSchema;
};
