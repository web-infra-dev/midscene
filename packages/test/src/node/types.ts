import type { NodeCaseContext, NodeDocumentContext } from '../engine/types';
import type { CommonNodeInput, NormalizedStepMeta } from '../parser/types';

export interface NodeResult<TData = unknown> {
  /** Human-readable summary for reports and later agent context. */
  summary?: string;

  /** Structured data for later steps. */
  data?: TData;
}

interface NodeExecutionContextBase<TInput = unknown, TContext = unknown> {
  /** The node input without `$`, including the common `prompt` input. */
  input: TInput & CommonNodeInput;

  /** The normalized engine metadata for this step. */
  $: Readonly<NormalizedStepMeta>;

  /** The timeout and cancellation signal for this step. */
  signal: AbortSignal;

  /** Resources shared by the current workflow document. */
  context: TContext;
}

export type NodeExecutionContext<
  TInput = unknown,
  TContext = unknown,
> = NodeExecutionContextBase<TInput, TContext> &
  (
    | {
        /** The node is running for one case. */
        scope: 'case';

        /** Identity and completed-step history for the case being executed. */
        case: NodeCaseContext;

        document?: never;
      }
    | {
        /** The node is running for the workflow document. */
        scope: 'document';

        /** Identity and completed-node history for the document being executed. */
        document: NodeDocumentContext;

        case?: never;
      }
  );

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
