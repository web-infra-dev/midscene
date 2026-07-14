import {
  NodeExecutionError,
  StepTimeoutError,
  normalizeWorkflowError,
} from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import { validateCommonNodeInput } from '../parser/normalize';
import type { CommonNodeInput, NormalizedStep } from '../parser/types';
import type { NodeWorkflowContext, StepRunResult } from './types';

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

const standaloneWorkflowContext = (): NodeWorkflowContext => ({
  testId: 'standalone-step',
  runId: 'standalone-step',
  name: 'standalone step',
  sourcePath: '',
  workflowIndex: 0,
  stepIndex: 0,
  completedSteps: Object.freeze([]),
});

export async function runStepForWorkflow<
  TInput = unknown,
  TOutputData = unknown,
>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData>,
  workflow: NodeWorkflowContext,
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
      workflow,
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

    return {
      ...createStepResultBase(step, startedAt),
      status: 'failed',
      continuedAfterError: step.meta.continueOnError,
      error: normalizedError,
    };
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

/** RFC 0001 compatibility API: a non-continuable step still rejects. */
export async function runStep<TInput = unknown, TOutputData = unknown>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData>,
  workflow: NodeWorkflowContext = standaloneWorkflowContext(),
): Promise<StepRunResult<TOutputData>> {
  const result = await runStepForWorkflow(step, node, workflow);
  if (result.status === 'failed' && !result.continuedAfterError) {
    throw result.error;
  }
  return result;
}
