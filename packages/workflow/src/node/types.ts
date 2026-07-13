import type { CommonNodeInput, NormalizedStepMeta } from '../parser/types';

export interface NodeResult<TData = unknown> {
  /** Human-readable summary for reports and later agent context. */
  summary?: string;

  /** Structured data for later steps. */
  data?: TData;
}

export interface NodeExecutionContext<TInput = unknown> {
  /** The node input without `$`, including the common `prompt` input. */
  input: TInput & CommonNodeInput;

  /** The normalized engine metadata for this step. */
  $: Readonly<NormalizedStepMeta>;

  /** The timeout and cancellation signal for this step. */
  signal: AbortSignal;
}

export type NodeExecutionReturn<TData = unknown> =
  // biome-ignore lint/suspicious/noConfusingVoidType: RFC 0001 allows async nodes to resolve without a result.
  Promise<NodeResult<TData> | void> | NodeResult<TData> | void;

export interface DefineNodeOptions<TInput = unknown, TData = unknown> {
  name: string;
  title?: string;
  description?: string;
  execute(ctx: NodeExecutionContext<TInput>): NodeExecutionReturn<TData>;
}

export interface NodeDefinition<TInput = unknown, TData = unknown>
  extends DefineNodeOptions<TInput, TData> {}
