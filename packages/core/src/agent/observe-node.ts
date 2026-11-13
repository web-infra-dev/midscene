import { z } from 'zod/v4';
import type { TUserPrompt } from '../common';
import { NodeExecutionError } from '../test-runner/errors';
import type { Agent } from './agent';

const assertionResultSchema = z.object({
  pass: z.boolean(),
  thought: z.string().optional(),
  message: z.string().optional(),
});
type ObservationAgent = Pick<Agent, 'startObserving' | 'aiAct' | 'flushReport'>;
type ObservationData = Partial<z.infer<typeof assertionResultSchema>> & {
  frameCount: number;
  durationMs: number;
};

async function settle(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!ms) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Shared Agent Node lifecycle; recording and insight remain SDK-owned. */
export async function executeObserve(
  value: unknown,
  input: { act: TUserPrompt; assert: TUserPrompt; settleMs: number },
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (
    typeof value !== 'object' ||
    value === null ||
    !['startObserving', 'aiAct', 'flushReport'].every(
      (name) => typeof Reflect.get(value, name) === 'function',
    )
  ) {
    throw new TypeError(
      'observe requires an Agent with startObserving(), aiAct(), and flushReport().',
    );
  }
  const agent = value as ObservationAgent;
  let observer:
    | Awaited<ReturnType<ObservationAgent['startObserving']>>
    | undefined;
  let stopPromise: ReturnType<NonNullable<typeof observer>['stop']> | undefined;
  let hasInitialFrame = false;
  let data: ObservationData | undefined;
  const errors: unknown[] = [];
  const stop = () => {
    if (!observer) return undefined;
    if (!stopPromise) {
      stopPromise = Promise.resolve()
        .then(() => observer!.stop())
        .then((observation) => {
          // Also retain facts when the action fails or cancellation interrupts settling.
          // A representative frame captured by stop cannot replace a missing baseline.
          if (hasInitialFrame) {
            const frameCount = observation.frameCount;
            const durationMs = observation.endedAt - observation.startedAt;
            if (
              !Number.isSafeInteger(frameCount) ||
              frameCount < 1 ||
              !Number.isFinite(durationMs) ||
              durationMs < 0
            ) {
              throw new Error(
                'Observation returned an empty or invalid screenshot window.',
              );
            }
            data = { frameCount, durationMs };
          }
          return observation;
        });
      // Abort listeners cannot await; the main finally always owns settlement.
      void stopPromise.catch(() => {});
    }
    return stopPromise;
  };
  const abort = () => {
    stop();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    // The Runner owns the deadline; an SDK watchdog would truncate the window.
    observer = await agent.startObserving({ watchdogMs: 0 });
    hasInitialFrame =
      Number.isSafeInteger(observer.bufferedFrameCount) &&
      observer.bufferedFrameCount > 0;
    signal.throwIfAborted();
    if (!hasInitialFrame)
      throw new Error('Observation did not capture an initial frame.');
    await agent.aiAct(input.act, { abortSignal: signal });
    signal.throwIfAborted();
    await settle(input.settleMs, signal);
    const observation = await stop()!;
    signal.throwIfAborted();
    const result = assertionResultSchema.parse(
      await observation.aiAssert(input.assert, undefined, {
        keepRawResponse: true,
        abortSignal: signal,
      }),
    );
    data = { ...data!, ...result };
    signal.throwIfAborted();
    if (!result.pass)
      throw new Error(
        result.message || result.thought || 'Observed condition did not hold.',
      );
  } catch (error) {
    errors.push(error);
  } finally {
    signal.removeEventListener('abort', abort);
    try {
      await stop();
    } catch (error) {
      if (!errors.includes(error)) errors.push(error);
    }
    // Persist report images before releasing the observation's temporary files.
    try {
      await agent.flushReport();
    } catch (error) {
      errors.push(error);
    }
    try {
      await observer?.dispose();
    } catch (error) {
      if (!errors.includes(error)) errors.push(error);
    }
  }
  if (signal.aborted && !errors.includes(signal.reason))
    errors.push(signal.reason);
  const text =
    typeof input.assert === 'string' ? input.assert : input.assert.prompt;
  if (errors.length) {
    throw new NodeExecutionError(
      'observe',
      errors.length === 1
        ? errors[0]
        : new AggregateError(errors, 'Observation or cleanup failed.'),
      { summary: `Observation failed: ${text}`, ...(data ? { data } : {}) },
    );
  }
  return { summary: `Observation passed: ${text}`, data };
}
