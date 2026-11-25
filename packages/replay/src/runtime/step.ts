import type { Agent } from '@midscene/core';
import { describeError } from '../verification/diagnostic';
import { withoutReplayFallback } from './actions';
import { type Replay, type ReplayOptions, withReplay } from './with-replay';

export interface StepContext<Params = Record<string, unknown>> {
  agent: Agent;
  input: Record<string, unknown>;
  params: Params;
  signal: AbortSignal;
}
type StepFn<Params> = (
  rp: Replay,
  ctx: StepContext<Params>,
) => unknown | Promise<unknown>;
export interface ReplayStep<Params = Record<string, unknown>> {
  ready?: StepFn<Params>;
  run: StepFn<Params>;
  done?: StepFn<Params>;
}

export function defineStep<Params = Record<string, unknown>>(
  step: ReplayStep<Params>,
): Readonly<ReplayStep<Params>> {
  if (!step || typeof step !== 'object' || typeof step.run !== 'function')
    throw new TypeError('defineStep requires a run function.');
  for (const key of Object.keys(step)) {
    if (!['ready', 'run', 'done'].includes(key))
      throw new TypeError(
        `Unknown step field: ${key}. Flow metadata and retries belong to Midscene Test.`,
      );
    if (typeof step[key as keyof ReplayStep<Params>] !== 'function')
      throw new TypeError(`${key} must be a function.`);
  }
  return Object.freeze({ ...step });
}

/** One implementation attempt. Test owns identity, retries and native fallback. */
export async function runReplayStep(
  agent: Agent,
  definition: ReplayStep,
  options: ReplayOptions & {
    input?: Record<string, unknown>;
    params?: Record<string, unknown>;
    strict?: boolean;
  } = {},
): Promise<unknown> {
  const step = defineStep(definition);
  const signal = options.signal ?? new AbortController().signal;
  const execute = async () => {
    const rp = withReplay(agent, { ...options, signal });
    const ctx = {
      agent,
      input: options.input ?? {},
      params: options.params ?? {},
      signal,
    };
    let value: unknown;
    const phaseMs: Partial<Record<'ready' | 'run' | 'done', number>> = {};
    for (const phase of ['ready', 'run', 'done'] as const) {
      signal.throwIfAborted();
      if (!step[phase]) continue;
      const started = performance.now();
      let failure: unknown;
      let failed = false;
      try {
        const output = await step[phase](rp, ctx);
        signal.throwIfAborted();
        if (phase === 'run') value = output;
      } catch (error) {
        failed = true;
        failure = error;
        throw error;
      } finally {
        phaseMs[phase] = performance.now() - started;
        options.onEvent?.({
          type: 'phase',
          phase,
          phaseMs: { ...phaseMs },
          status: failed ? 'failed' : 'passed',
          ...(failed ? { error: describeError(failure) } : {}),
        });
      }
    }
    return value;
  };
  return options.strict ? withoutReplayFallback(execute) : execute();
}
