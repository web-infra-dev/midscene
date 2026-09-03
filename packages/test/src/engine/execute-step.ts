import {
  NodeExecutionError,
  NodeInputValidationError,
  StepTimeoutError,
  normalizeNodeExecutionError,
} from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import { validateCommonNodeInput } from '../parser/normalize';
import type { CommonNodeInput, NormalizedStep } from '../parser/types';
import { assertJsonSerializable } from './history';
import type {
  NodeCaseContext,
  NodeDocumentContext,
  NodeExecutionPhase,
  NodeHistoryEntry,
  NodeScopeTeardown,
  StepRunResult,
} from './types';

function validateNodeOutput<TData>(
  output: unknown,
  node: string,
): NodeResult<TData> | undefined {
  if (output === undefined) {
    return undefined;
  }

  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new NodeExecutionError(
      node,
      new TypeError('Node output must be an object or undefined.'),
    );
  }

  if (
    'summary' in output &&
    output.summary !== undefined &&
    typeof output.summary !== 'string'
  ) {
    throw new NodeExecutionError(
      node,
      new TypeError('Node output summary must be a string.'),
    );
  }

  if ('data' in output && output.data !== undefined) {
    assertJsonSerializable(output.data, 'output.data', node);
  }

  return output as NodeResult<TData>;
}

function createStepResultBase(
  step: NormalizedStep,
  startedAt: Date,
  phase: NodeExecutionPhase,
  stepIndex: number,
) {
  const endedAt = new Date();
  return {
    node: step.node,
    phase,
    stepIndex,
    input: step.input,
    meta: step.meta,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };
}

async function executeNode<TOutputData>(
  step: NormalizedStep,
  execute: (signal: AbortSignal) => unknown,
  phase: NodeExecutionPhase,
  stepIndex: number,
  options: { parentSignal?: AbortSignal; defaultTimeoutMs?: number },
): Promise<StepRunResult<TOutputData>> {
  validateCommonNodeInput(step.input, stepIndex);

  const startedAt = new Date();
  const abortController = new AbortController();
  const parentSignal = options.parentSignal;
  const abortFromParent = () => abortController.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timeoutMs = step.meta.timeoutMs ?? options.defaultTimeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortGraceTimeout: ReturnType<typeof setTimeout> | undefined;
  const execution = Promise.resolve().then(() => {
    abortController.signal.throwIfAborted();
    return execute(abortController.signal);
  });
  let settleOnAbort: (() => void) | undefined;
  const abortedExecution = new Promise<never>((_, reject) => {
    settleOnAbort = () => {
      // Abort listeners run synchronously. Wait one task before rejecting so a
      // cooperative node can settle in response to the forwarded abort first.
      abortGraceTimeout = setTimeout(() => {
        reject(abortController.signal.reason);
      }, 0);
    };
    if (abortController.signal.aborted) settleOnAbort();
    else
      abortController.signal.addEventListener('abort', settleOnAbort, {
        once: true,
      });
  });
  const timeoutExecution =
    timeoutMs === undefined
      ? undefined
      : new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            if (abortController.signal.aborted) {
              reject(abortController.signal.reason);
              return;
            }
            const timeoutError = new StepTimeoutError(timeoutMs, step.node);
            abortController.abort(timeoutError);
            reject(timeoutError);
          }, timeoutMs);
        });
  const settledExecution = Promise.race([
    execution,
    abortedExecution,
    ...(timeoutExecution === undefined ? [] : [timeoutExecution]),
  ]);

  try {
    const output = validateNodeOutput<TOutputData>(
      await settledExecution,
      step.node,
    );
    return {
      ...createStepResultBase(step, startedAt, phase, stepIndex),
      status: 'success',
      continuedAfterError: false,
      ...(output === undefined ? {} : { output }),
    };
  } catch (error) {
    return {
      ...createStepResultBase(step, startedAt, phase, stepIndex),
      status: 'failed',
      continuedAfterError: step.meta.continueOnError,
      error: normalizeNodeExecutionError(error, step.node),
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abortGraceTimeout !== undefined) clearTimeout(abortGraceTimeout);
    if (settleOnAbort !== undefined) {
      abortController.signal.removeEventListener('abort', settleOnAbort);
    }
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

type StepExecutionTarget =
  | { scope: 'case'; case: NodeCaseContext }
  | { scope: 'document'; document: NodeDocumentContext };

async function parseNodeInput<TInput, TData, TContext>(
  node: NodeDefinition<TInput, TData, TContext>,
  input: Record<string, unknown>,
): Promise<TInput & CommonNodeInput> {
  if (!node.inputSchema) {
    return input as TInput & CommonNodeInput;
  }

  const parsed = await node.inputSchema.safeParseAsync(input);
  if (!parsed.success) {
    throw NodeInputValidationError.fromZod(node.name, parsed.error);
  }
  return parsed.data as TInput & CommonNodeInput;
}

export async function executeStep<
  TInput = unknown,
  TOutputData = unknown,
  TContext = unknown,
>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData, TContext>,
  target: StepExecutionTarget,
  context: TContext,
  execution: {
    history?: readonly NodeHistoryEntry[];
    signal?: AbortSignal;
    defaultTimeoutMs?: number;
    onTeardown?(node: string, teardown: NodeScopeTeardown): void;
  } = {},
): Promise<StepRunResult<TOutputData>> {
  const phase =
    target.scope === 'case' ? target.case.phase : target.document.phase;
  const stepIndex =
    target.scope === 'case' ? target.case.stepIndex : target.document.stepIndex;

  return executeNode<TOutputData>(
    step,
    async (signal) => {
      const input = await parseNodeInput(node, step.input);
      signal.throwIfAborted();
      const common = {
        input,
        $: step.meta,
        signal,
        context,
        history: execution.history ?? Object.freeze([]),
        onTeardown: (teardown: NodeScopeTeardown) => {
          if (!execution.onTeardown) {
            throw new NodeExecutionError(
              step.node,
              new Error(
                'The current execution scope cannot register teardown.',
              ),
            );
          }
          execution.onTeardown(step.node, teardown);
        },
      };
      return target.scope === 'case'
        ? node.execute({ ...common, scope: 'case', case: target.case })
        : node.execute({
            ...common,
            scope: 'document',
            document: target.document,
          });
    },
    phase,
    stepIndex,
    {
      parentSignal: execution.signal,
      defaultTimeoutMs: execution.defaultTimeoutMs,
    },
  );
}
