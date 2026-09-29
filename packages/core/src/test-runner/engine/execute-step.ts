import {
  NodeExecutionError,
  NodeInputValidationError,
  StepTimeoutError,
  normalizeNodeExecutionError,
} from '../errors';
import type {
  NodeDefinition,
  NodeReportCollector,
  NodeReportTrace,
  NodeResult,
} from '../node/types';
import type { NormalizedStep } from '../parser/types';
import { linkResourceSignal } from './resource-operations';
import type {
  NodeCaseContext,
  NodeDocumentContext,
  NodeExecutionPhase,
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

  // Node data is an API value. JSON serialization belongs to the publisher;
  // serialization failure must not turn completed actions into retryable work.

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
  const startedAt = new Date();
  const abortController = new AbortController();
  const parentSignal = options.parentSignal;
  linkResourceSignal(abortController.signal, parentSignal);
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
    let output: NodeResult<TOutputData> | undefined;
    let failure = error;
    if (error instanceof NodeExecutionError && error.output !== undefined) {
      try {
        output = validateNodeOutput<TOutputData>(error.output, step.node);
      } catch (validationError) {
        failure = validationError;
      }
    }
    return {
      ...createStepResultBase(step, startedAt, phase, stepIndex),
      status: 'failed',
      continuedAfterError: step.meta.continueOnError,
      error: normalizeNodeExecutionError(failure, step.node),
      ...(output === undefined ? {} : { output }),
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

function createNodeReportCollector(node: string): {
  collector: NodeReportCollector;
  close(): readonly NodeReportTrace[];
} {
  const traces = new Map<string, NodeReportTrace>();
  let accepting = true;

  return {
    collector: Object.freeze({
      addTrace(trace: NodeReportTrace): void {
        if (!accepting) {
          throw new NodeExecutionError(
            node,
            new Error(
              'Report traces can only be added while the current Step is running.',
            ),
          );
        }
        if (
          !trace ||
          typeof trace !== 'object' ||
          (trace as { type?: unknown }).type !== 'midscene-execution'
        ) {
          throw new NodeExecutionError(
            node,
            new TypeError('Report trace type must be "midscene-execution".'),
          );
        }
        if (
          typeof trace.executionId !== 'string' ||
          trace.executionId.trim().length === 0
        ) {
          throw new NodeExecutionError(
            node,
            new TypeError('Report trace executionId must be non-empty.'),
          );
        }
        const normalized = Object.freeze({
          type: 'midscene-execution' as const,
          executionId: trace.executionId,
        });
        traces.set(`${normalized.type}:${normalized.executionId}`, normalized);
      },
    }),
    close(): readonly NodeReportTrace[] {
      accepting = false;
      return Object.freeze([...traces.values()]);
    },
  };
}

async function parseNodeInput<TInput, TData, TContext>(
  node: NodeDefinition<TInput, TData, TContext>,
  input: Record<string, unknown>,
): Promise<TInput> {
  if (!node.inputSchema) {
    return input as TInput;
  }

  const parsed = await node.inputSchema.safeParseAsync(input);
  if (!parsed.success) {
    throw NodeInputValidationError.fromZod(node.name, parsed.error);
  }
  return parsed.data as TInput;
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
    signal?: AbortSignal;
    defaultTimeoutMs?: number;
    onTeardown?(node: string, teardown: NodeScopeTeardown): void;
  } = {},
): Promise<StepRunResult<TOutputData>> {
  const phase =
    target.scope === 'case' ? target.case.phase : target.document.phase;
  const stepIndex =
    target.scope === 'case' ? target.case.stepIndex : target.document.stepIndex;

  const reportCollector = createNodeReportCollector(step.node);
  let result: StepRunResult<TOutputData> | undefined;

  try {
    result = await executeNode<TOutputData>(
      step,
      async (signal) => {
        const input = await parseNodeInput(node, step.input);
        signal.throwIfAborted();
        const common = {
          input,
          $: step.meta,
          signal,
          context,
          report: reportCollector.collector,
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
  } finally {
    const traces = reportCollector.close();
    if (traces.length > 0 && result) {
      result = { ...result, report: { traces } };
    }
  }

  if (!result) {
    throw new NodeExecutionError(
      step.node,
      new Error('Step execution completed without a result.'),
    );
  }
  return result;
}
