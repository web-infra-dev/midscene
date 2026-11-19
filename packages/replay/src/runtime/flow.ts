import type { Agent } from '@midscene/core';
import { describeError } from '../verification/diagnostic';
import type { VerdictJudge } from './judge';
import { replayError } from './web-page';
import {
  type Replay,
  type ReplayRequirements,
  type StepRef,
  createReplayRuntime,
  replayEvents,
} from './with-replay';

export type StepRetry = 'before-dispatch' | 'idempotent' | 'never';

export interface StepContext<Params = Record<string, unknown>> {
  /** The host Agent. Access makes dispatch tracking incomplete for this attempt. */
  agent: Agent;
  /** Host parameters passed to `flow.run(agent, {params})`. */
  params: Params;
  /** Values shared between steps of one run. */
  state: Record<string, unknown>;
  /** Return values of completed steps, by step id. */
  results: Record<string, unknown>;
  step: StepRef;
}

type StepFn = (rp: Replay, ctx: StepContext) => unknown;
export interface ReplayStep {
  /** Stable kebab-case identity, used by `from`/`until`, reports and reviews. */
  id: string;
  title: string;
  /**
   * `before-dispatch` (default): retry only if the failed attempt dispatched
   * nothing and did not access the host Agent. `idempotent`: repeating the step
   * is safe even after dispatch.
   * `never`: one attempt.
   */
  retry?: StepRetry;
  /** Total attempts including the first. Default 2, or 1 for `never`. */
  maxAttempts?: number;
  /** A failed optional step is recorded and the flow continues. */
  optional?: boolean;
  /** Entry state check. Required to start a run at this step. */
  ready?: StepFn;
  run: StepFn;
  /** Exit state check. Also accepts a step whose action took effect late. */
  done?: StepFn;
}

type StepPhase = 'ready' | 'run' | 'done';

export interface AttemptOutcome {
  attempt: number;
  status: 'passed' | 'recovered' | 'failed';
  phase?: StepPhase;
  dispatched: number;
  /** The native Agent was accessed, so the Replay dispatch count may be incomplete. */
  dispatchUnknown?: true;
  durationMs: number;
  /** Elapsed milliseconds for each callback reached, including a recovery check. */
  phaseMs?: Partial<Record<StepPhase, number>>;
  error?: ReturnType<typeof describeError>;
  recoveryError?: ReturnType<typeof describeError>;
}
export interface StepOutcome {
  number: number;
  id: string;
  title: string;
  optional: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  attempts: AttemptOutcome[];
  durationMs?: number;
  error?: ReturnType<typeof describeError>;
}
export interface FlowOutcome {
  status: 'passed' | 'failed';
  steps: StepOutcome[];
  /** First failed required step; a host may resume here if it is ready. */
  failedStep?: string;
}

export class ReplayStepError extends Error {
  readonly code = 'REPLAY_STEP_FAILED';
  constructor(
    readonly outcome: FlowOutcome,
    readonly step: StepOutcome,
    options: { cause: unknown },
  ) {
    super(
      `REPLAY_STEP_FAILED: ${step.number}. ${step.title} (${step.id}) after ${step.attempts.length} attempt(s): ${describeError(options.cause).message}`,
      options,
    );
  }
}

const stepId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function defineStep(step: ReplayStep): Readonly<ReplayStep> {
  if (!step || typeof step !== 'object')
    throw replayError('INVALID_REPLAY_STEP');
  if (typeof step.id !== 'string' || !stepId.test(step.id))
    throw replayError('INVALID_REPLAY_STEP', {
      id: step.id,
      reason: 'id must be kebab-case',
    });
  if (typeof step.title !== 'string' || !step.title.trim())
    throw replayError('INVALID_REPLAY_STEP', {
      id: step.id,
      reason: 'title is required',
    });
  for (const key of ['ready', 'run', 'done'] as const)
    if (
      (key === 'run' || step[key] !== undefined) &&
      typeof step[key] !== 'function'
    )
      throw replayError('INVALID_REPLAY_STEP', {
        id: step.id,
        reason: `${key} must be a function`,
      });
  const retry = step.retry ?? 'before-dispatch';
  if (!['before-dispatch', 'idempotent', 'never'].includes(retry))
    throw replayError('INVALID_REPLAY_STEP', { id: step.id, retry });
  const maxAttempts = step.maxAttempts ?? (retry === 'never' ? 1 : 2);
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    (retry === 'never' && maxAttempts !== 1)
  )
    throw replayError('INVALID_REPLAY_STEP', { id: step.id, maxAttempts });
  return Object.freeze({ ...step, retry, maxAttempts });
}

export interface ReplayMeta {
  platform: 'web';
  startUrl?: string;
  requires?: ReplayRequirements;
}
export interface RunOptions<Params = Record<string, unknown>> {
  params?: Params;
  /** Start at this step (id or 1-based number). Starting after step 1 requires `ready`. */
  from?: string | number;
  /** Stop after this step (id or 1-based number). */
  until?: string | number;
  /** Set false to make every step a single attempt. */
  retry?: boolean;
}
export interface ReplayFlow {
  readonly meta: ReplayMeta;
  readonly steps: readonly Readonly<ReplayStep>[];
  run(agent: Agent, options?: RunOptions): Promise<FlowOutcome>;
}

export function resolveReplayRange(
  steps: readonly Readonly<ReplayStep>[],
  { from, until }: Pick<RunOptions, 'from' | 'until'> = {},
) {
  function indexOf(selector: string | number) {
    const index =
      typeof selector === 'number'
        ? selector - 1
        : steps.findIndex((step) => step.id === selector);
    if (!Number.isSafeInteger(index) || index < 0 || index >= steps.length)
      throw replayError('UNKNOWN_REPLAY_STEP', { step: selector });
    return index;
  }

  const first = from === undefined ? 0 : indexOf(from);
  const last = until === undefined ? steps.length - 1 : indexOf(until);
  if (first > last) throw replayError('INVALID_REPLAY_RANGE', { from, until });
  return { first, last };
}

export function defineReplay(definition: {
  meta: ReplayMeta;
  steps: readonly Readonly<ReplayStep>[];
  options?: {
    judge?: VerdictJudge;
    timeoutMs?: number;
    fallbackTimeoutMs?: number;
  };
}): ReplayFlow {
  const { meta, steps, options = {} } = definition ?? {};
  if (meta?.platform !== 'web')
    throw replayError('PLATFORM_UNSUPPORTED', { platform: meta?.platform });
  if (!Array.isArray(steps) || !steps.length)
    throw replayError('INVALID_REPLAY_FLOW', { reason: 'steps are required' });
  const checked = steps.map((step) => defineStep(step));
  const ids = new Set(checked.map((step) => step.id));
  if (ids.size !== checked.length)
    throw replayError('INVALID_REPLAY_FLOW', { reason: 'duplicate step id' });
  async function run(
    agent: Agent,
    runOptions: RunOptions = {},
  ): Promise<FlowOutcome> {
    const { first, last } = resolveReplayRange(checked, runOptions);
    if (first > 0 && !checked[first].ready)
      throw replayError('STEP_READY_REQUIRED', { step: checked[first].id });
    const {
      replay: rp,
      setStep,
      dispatches,
    } = createReplayRuntime(agent, {
      ...options,
      requires: meta.requires,
    });
    const ctx = {
      params: runOptions.params ?? {},
      state: {},
      results: {} as Record<string, unknown>,
    };
    const outcome: FlowOutcome = {
      status: 'passed',
      steps: checked.map((step, index) => ({
        number: index + 1,
        id: step.id,
        title: step.title,
        optional: !!step.optional,
        status: index < first ? 'skipped' : 'not-run',
        attempts: [],
      })),
    };
    const publish = (event: Record<string, unknown>) =>
      replayEvents.publish({ agent, event: { type: 'step', ...event } });

    try {
      for (let index = first; index <= last; index++) {
        const step = checked[index];
        const result = outcome.steps[index];
        const started = performance.now();
        const attempts = runOptions.retry === false ? 1 : step.maxAttempts!;
        let failure: { cause: unknown } | undefined;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          const ref = {
            number: index + 1,
            id: step.id,
            title: step.title,
            attempt,
          };
          setStep(ref);
          publish({ phase: 'attempt', step: ref });
          const dispatchTracking: Pick<AttemptOutcome, 'dispatchUnknown'> = {};
          let phase: StepPhase = 'ready';
          let usedAgentInRun = false;
          let resultsForStep = ctx.results;
          const stepCtx: StepContext = {
            params: ctx.params,
            state: ctx.state,
            step: ref,
            get agent() {
              dispatchTracking.dispatchUnknown = true;
              if (phase === 'run') usedAgentInRun = true;
              return agent;
            },
            get results() {
              return resultsForStep;
            },
          };
          const before = dispatches();
          let beforeRun = before;
          const attemptStart = performance.now();
          const phaseMs: Partial<Record<StepPhase, number>> = {};
          async function runPhase(phase: StepPhase, fn: StepFn) {
            const started = performance.now();
            try {
              return await fn.call(step, rp, stepCtx);
            } finally {
              phaseMs[phase] = performance.now() - started;
            }
          }
          try {
            if (step.ready) await runPhase(phase, step.ready);
            beforeRun = dispatches();
            phase = 'run';
            const value = await runPhase(phase, step.run);
            phase = 'done';
            if (step.done) {
              resultsForStep = { ...ctx.results, [step.id]: value };
              await runPhase(phase, step.done);
            }
            ctx.results[step.id] = value;
            result.attempts.push({
              attempt,
              status: 'passed',
              dispatched: dispatches() - before,
              ...dispatchTracking,
              durationMs: performance.now() - attemptStart,
              phaseMs,
            });
            failure = undefined;
            break;
          } catch (error) {
            failure = { cause: error };
            const dispatched = dispatches() - before;
            let recoveryError: AttemptOutcome['recoveryError'];
            // The action may have taken effect although the run failed later.
            if (
              phase === 'run' &&
              (dispatches() > beforeRun || usedAgentInRun) &&
              step.done
            ) {
              try {
                await runPhase('done', step.done);
                result.attempts.push({
                  attempt,
                  status: 'recovered',
                  phase,
                  dispatched,
                  ...dispatchTracking,
                  durationMs: performance.now() - attemptStart,
                  phaseMs,
                  error: describeError(error),
                });
                failure = undefined;
                break;
              } catch (doneError) {
                recoveryError = describeError(doneError, 'done');
              }
            }
            result.attempts.push({
              attempt,
              status: 'failed',
              phase,
              dispatched,
              ...dispatchTracking,
              durationMs: performance.now() - attemptStart,
              phaseMs,
              error: describeError(error),
              ...(recoveryError ? { recoveryError } : {}),
            });
            const retryable =
              step.retry === 'idempotent' ||
              (step.retry === 'before-dispatch' &&
                dispatched === 0 &&
                !dispatchTracking.dispatchUnknown);
            if (!retryable || attempt === attempts) break;
            publish({
              phase: 'retry',
              step: ref,
              reason: describeError(error),
            });
          }
        }
        result.durationMs = performance.now() - started;
        result.status = failure ? 'failed' : 'passed';
        if (failure) result.error = describeError(failure.cause);
        publish({
          phase: 'end',
          step: { number: index + 1, id: step.id, title: step.title },
          status: result.status,
          attempts: result.attempts.length,
        });
        if (failure && !step.optional) {
          outcome.status = 'failed';
          outcome.failedStep = step.id;
          throw new ReplayStepError(outcome, result, failure);
        }
        // An optional failure stays visible in its step outcome only.
      }
    } finally {
      setStep(undefined);
    }
    return outcome;
  }

  return Object.freeze({ meta, steps: Object.freeze(checked), run });
}
