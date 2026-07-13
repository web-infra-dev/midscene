import {
  NodeExecutionError,
  StepTimeoutError,
  normalizeWorkflowError,
} from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import { validateCommonNodeInput } from '../parser/normalize';
import type { CommonNodeInput, NormalizedStep } from '../parser/types';
import type { StepRunResult } from './types';

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

  return output as NodeResult<TData>;
}

function createStepResultBase(step: NormalizedStep, startedAt: Date) {
  const endedAt = new Date();
  return {
    node: step.node,
    input: step.input,
    meta: step.meta,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };
}

export async function runStep<TInput = unknown, TOutputData = unknown>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData>,
): Promise<StepRunResult<TOutputData>> {
  validateCommonNodeInput(step.input, 0);

  const startedAt = new Date();
  const abortController = new AbortController();
  const timeoutMs = step.meta.timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: StepTimeoutError | undefined;

  const execution = Promise.resolve().then(() =>
    node.execute({
      input: step.input as TInput & CommonNodeInput,
      $: step.meta,
      signal: abortController.signal,
    }),
  );

  const timedExecution =
    timeoutMs === undefined
      ? execution
      : Promise.race([
          execution,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              timeoutError = new StepTimeoutError(timeoutMs, step.node);
              abortController.abort(timeoutError);
              reject(timeoutError);
            }, timeoutMs);
          }),
        ]);

  try {
    const output = validateNodeOutput<TOutputData>(
      await timedExecution,
      step.node,
    );

    return {
      ...createStepResultBase(step, startedAt),
      status: 'success',
      continuedAfterError: false,
      ...(output === undefined ? {} : { output }),
    };
  } catch (error) {
    const normalizedError = normalizeWorkflowError(
      timeoutError ?? error,
      step.node,
    );

    if (!step.meta.continueOnError) {
      throw normalizedError;
    }

    return {
      ...createStepResultBase(step, startedAt),
      status: 'failed',
      continuedAfterError: true,
      error: normalizedError,
    };
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
