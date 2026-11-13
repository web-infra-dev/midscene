import { evaluatePlanFreshness } from '@/agent/plan-freshness';
import {
  PlannedWaitError,
  definePlannedWait,
  isPlannedWaitError,
} from '@/agent/planned-wait';
import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem } from '@/screenshot-item';
import { describe, expect, it, rs } from '@rstest/core';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const model = () =>
  getModelRuntime({
    modelName: 'test',
    modelDescription: 'test',
    intent: 'default',
    slot: 'default',
  });
function executorFor(check: (signal: AbortSignal) => Promise<boolean>) {
  const executor = new TaskExecutor(
    { interfaceType: 'web', actionSpace: () => [] } as any,
    {
      contextRetrieverFn: async () => ({
        screenshot: ScreenshotItem.create(image, Date.now()),
        shotSize: { width: 1, height: 1 },
        shrunkShotToLogicalRatio: 1,
        tree: { id: 'root', attributes: {}, children: [] },
      }),
    } as any,
    { getDefaultModelRuntime: model, actionSpace: [] },
  );
  rs.spyOn(executor as any, 'createTypeQueryTask').mockImplementation(
    async (...args: any[]) => ({
      type: 'Insight',
      subType: 'WaitFor',
      executor: async () => ({ output: await check(args[5].abortSignal) }),
    }),
  );
  return executor;
}

describe('planned conditional waiting', () => {
  it('forwards model-generated conditions and the action cancellation signal', async () => {
    const wait = rs.fn(async () => {});
    const action = definePlannedWait(wait);
    const signal = new AbortController().signal;
    const task = { planningFeedback: '' };
    await action.call({ condition: 'Send is enabled' }, {
      signal,
      task,
    } as any);
    expect(task.planningFeedback).toContain(
      'WaitFor succeeded: Send is enabled',
    );
    expect(wait).toHaveBeenCalledWith('Send is enabled', signal);
  });
  it('retains terminal identity through nested task error causes', async () => {
    const failure = new PlannedWaitError(new Error('condition timeout'));
    expect(isPlannedWaitError({ cause: { cause: failure } })).toBe(true);
    expect(isPlannedWaitError(new Error('ordinary action failure'))).toBe(
      false,
    );
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(isPlannedWaitError(cycle)).toBe(false);
    await expect(
      definePlannedWait(async () => {
        throw new Error('timeout');
      }).call({ condition: 'ready' }),
    ).rejects.toThrow('Planned WaitFor failed: timeout');
  });
  it('returns immediately when the first check succeeds and cleans the deadline timer', async () => {
    let signal: AbortSignal | undefined;
    const check = rs.fn(async (current: AbortSignal) => {
      signal = current;
      return true;
    });
    await executorFor(check).waitFor(
      'ready',
      { timeoutMs: 30, checkIntervalMs: 10 },
      model(),
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(check).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
  });
  it('cancels an active condition check at the total deadline', async () => {
    const check = rs.fn(
      (signal: AbortSignal) =>
        new Promise<boolean>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    await expect(
      executorFor(check).waitFor(
        'ready',
        { timeoutMs: 30, checkIntervalMs: 10 },
        model(),
      ),
    ).rejects.toThrow('waitFor timeout');
    expect(check).toHaveBeenCalledTimes(1);
  });
  it('honors explicit cancellation during a check', async () => {
    const controller = new AbortController();
    const check = rs.fn(async (signal: AbortSignal) => {
      controller.abort(new Error('cancelled by caller'));
      signal.throwIfAborted();
      return false;
    });
    await expect(
      executorFor(check).waitFor(
        'ready',
        {
          timeoutMs: 1000,
          checkIntervalMs: 10,
          abortSignal: controller.signal,
        },
        model(),
      ),
    ).rejects.toThrow('cancelled by caller');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('rejects a late success from a check that ignores cancellation', async () => {
    const check = rs.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 45));
      return true;
    });
    await expect(
      executorFor(check).waitFor(
        'ready',
        { timeoutMs: 20, checkIntervalMs: 10 },
        model(),
      ),
    ).rejects.toThrow('waitFor timeout');
    expect(check).toHaveBeenCalledTimes(1);
  });
  it('skips freshness capture requirements for non-click plans', async () => {
    await expect(
      evaluatePlanFreshness(
        {} as any,
        [{ type: 'WaitFor', param: { condition: 'ready' } }] as any,
        'test',
        1,
      ),
    ).resolves.toBeUndefined();
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid timeout %s before model work',
    async (timeoutMs) => {
      const check = rs.fn(async () => true);
      await expect(
        executorFor(check).waitFor(
          'ready',
          { timeoutMs, checkIntervalMs: 1 },
          model(),
        ),
      ).rejects.toThrow('timeoutMs');
      expect(check).not.toHaveBeenCalled();
    },
  );
});
