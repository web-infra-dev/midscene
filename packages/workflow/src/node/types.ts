import type { NodeCaseContext, NodeDocumentContext } from '../engine/types';
import type { CommonNodeInput, NormalizedStepMeta } from '../parser/types';

export interface NodeResult<TData = unknown> {
  /** Human-readable summary for reports and later agent context. */
  summary?: string;

  /** Structured data for later steps. */
  data?: TData;
}

export interface NodeExecutionContext<TInput = unknown, TContext = unknown> {
  /** The node input without `$`, including the common `prompt` input. */
  input: TInput & CommonNodeInput;

  /** The normalized engine metadata for this step. */
  $: Readonly<NormalizedStepMeta>;

  /** The timeout and cancellation signal for this step. */
  signal: AbortSignal;

  /** Identity and completed-step history for the case being executed. */
  case: NodeCaseContext;

  /** Resources shared by the current workflow document. */
  context: TContext;
}

export type NodeExecutionReturn<TData = unknown> =
  // biome-ignore lint/suspicious/noConfusingVoidType: RFC 0001 allows async nodes to resolve without a result.
  Promise<NodeResult<TData> | void> | NodeResult<TData> | void;

export interface DefineNodeOptions<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  execute(
    ctx: NodeExecutionContext<TInput, TContext>,
  ): NodeExecutionReturn<TData>;
}

export interface NodeDefinition<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> extends DefineNodeOptions<TInput, TData, TContext> {}

export interface DocumentNodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> {
  input: TInput & CommonNodeInput;
  $: Readonly<NormalizedStepMeta>;
  signal: AbortSignal;
  document: NodeDocumentContext;
  context: TContext;
}

export interface DefineDocumentNodeOptions<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  execute(
    ctx: DocumentNodeExecutionContext<TInput, TContext>,
  ): NodeExecutionReturn<TData>;
}

export interface DocumentNodeDefinition<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
> extends DefineDocumentNodeOptions<TInput, TData, TContext> {}
