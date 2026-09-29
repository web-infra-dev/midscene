import {
  ActionReadiness,
  isActionReadinessError,
} from '@/agent/action-readiness';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const { warn } = rs.hoisted(() => ({ warn: rs.fn() }));
rs.mock('@midscene/shared/logger', () => ({ getDebug: () => warn }));

const action = { id: 'action-1', name: 'Tap', param: {} };

describe('ActionReadiness', () => {
  afterEach(() => {
    rs.useRealTimers();
    rs.clearAllMocks();
  });

  it.each([null, false, [], 'ready', {}, { createWaiter: () => 'skip' }])(
    'rejects non-function configuration %j',
    (callback) => {
      expect(() => new ActionReadiness(callback as any)).toThrow(
        'must be a function',
      );
    },
  );

  it('warns once after 5 seconds and keeps waiting until the callback resolves', async () => {
    rs.useFakeTimers();
    let resolve!: () => void;
    const callback = rs.fn(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        }),
    );
    const readiness = new ActionReadiness(callback);
    const finished = rs.fn();
    const pending = readiness.wait(action).then(finished);
    expect(callback).toHaveBeenCalledWith({ action });
    await rs.advanceTimersByTimeAsync(4999);
    expect(warn).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Tap (action-1)'),
    );
    await rs.advanceTimersByTimeAsync(60_000);
    expect(warn).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledOnce();
    resolve();
    await pending;
    expect(finished).toHaveBeenCalledOnce();
  });

  it('clears the warning timer after a quick completion', async () => {
    rs.useFakeTimers();
    await new ActionReadiness(async () => {}).wait(action);
    await rs.advanceTimersByTimeAsync(5000);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['sync', 'async'] as const)(
    'propagates %s failures and clears the timer',
    async (kind) => {
      rs.useFakeTimers();
      const cause = new Error('not ready');
      const readiness = new ActionReadiness(() => {
        if (kind === 'sync') throw cause;
        return Promise.reject(cause);
      });
      await expect(readiness.wait(action)).rejects.toMatchObject({
        cause,
        code: 'ACTION_READINESS_FAILED',
      });
      await rs.advanceTimersByTimeAsync(5000);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('recognizes serialized readiness failures without message matching', () => {
    expect(
      isActionReadinessError({
        code: 'TASK_EXECUTION_FAILED',
        cause: { code: 'ACTION_READINESS_FAILED' },
      }),
    ).toBe(true);
    expect(isActionReadinessError(new Error('ACTION_READINESS_FAILED'))).toBe(
      false,
    );
  });
});
