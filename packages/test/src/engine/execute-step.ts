import {
  NodeExecutionError,
  NodeInputValidationError,
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
): Promise<StepRunResult<TOutputData>> {
  const phase =
    target.scope === 'case' ? target.case.phase : target.document.phase;
  const stepIndex =
    target.scope === 'case' ? target.case.stepIndex : target.document.stepIndex;

  return executeNode<TOutputData>(
    step,
    async (signal) => {
      const input = await parseNodeInput(node, step.input);
      const common = {
        input,
        $: step.meta,
        signal,
        context,
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
  );
}
