import {
  NodeExecutionError,
  StepTimeoutError,
  normalizeNodeExecutionError,
} from '../errors';
import type { NodeDefinition, NodeResult } from '../node/types';
import { validateCommonNodeInput } from '../parser/normalize';
import type { CommonNodeInput, NormalizedStep } from '../parser/types';
import type {
  NodeCaseContext,
  NodeDocumentContext,
  NodeExecutionPhase,
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

const standaloneCaseContext = (): NodeCaseContext => ({
  caseId: 'standalone-step',
  runId: 'standalone-step',
  name: 'standalone step',
  sourcePath: '',
  caseIndex: 0,
  phase: 'steps',
  stepIndex: 0,
  completedSteps: Object.freeze([]),
  completedNodes: Object.freeze([]),
});

async function executeNode<TOutputData>(
  step: NormalizedStep,
  execute: (signal: AbortSignal) => unknown,
  phase: NodeExecutionPhase,
  stepIndex: number,
): Promise<StepRunResult<TOutputData>> {
  validateCommonNodeInput(step.input, stepIndex);

  const startedAt = new Date();
  const abortController = new AbortController();
  const timeoutMs = step.meta.timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: StepTimeoutError | undefined;
  const execution = Promise.resolve().then(() =>
    execute(abortController.signal),
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
      error: normalizeNodeExecutionError(timeoutError ?? error, step.node),
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function runStepForCase<
  TInput = unknown,
  TOutputData = unknown,
  TContext = unknown,
>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData, TContext>,
  caseContext: NodeCaseContext,
  context: TContext,
): Promise<StepRunResult<TOutputData>> {
  return executeNode<TOutputData>(
    step,
    (signal) =>
      node.execute({
        input: step.input as TInput & CommonNodeInput,
        $: step.meta,
        signal,
        scope: 'case',
        case: caseContext,
        context,
      }),
    caseContext.phase,
    caseContext.stepIndex,
  );
}

export async function runStepForDocument<
  TInput = unknown,
  TOutputData = unknown,
  TContext = unknown,
>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData, TContext>,
  document: NodeDocumentContext,
  context: TContext,
): Promise<StepRunResult<TOutputData>> {
  return executeNode<TOutputData>(
    step,
    (signal) =>
      node.execute({
        input: step.input as TInput & CommonNodeInput,
        $: step.meta,
        signal,
        scope: 'document',
        document,
        context,
      }),
    document.phase,
    document.stepIndex,
  );
}

/** Runs one normalized step outside a case. */
export async function runStep<TInput = unknown, TOutputData = unknown>(
  step: NormalizedStep,
  node: NodeDefinition<TInput, TOutputData, undefined>,
  caseContext: NodeCaseContext = standaloneCaseContext(),
): Promise<StepRunResult<TOutputData>> {
  const result = await runStepForCase(step, node, caseContext, undefined);
  if (result.status === 'failed' && !result.continuedAfterError) {
    throw result.error;
  }
  return result;
}
