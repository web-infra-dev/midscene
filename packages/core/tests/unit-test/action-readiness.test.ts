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
    expect(callback).toHaveBeenCalledWith({ action, signal: undefined });
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

  it('passes cancellation to the callback and stops waiting when it never settles', async () => {
    rs.useFakeTimers();
    const controller = new AbortController();
    const removeListener = rs.spyOn(controller.signal, 'removeEventListener');
    const callback = rs.fn(() => new Promise<void>(() => {}));
    const cause = new Error('stop waiting');
    const pending = new ActionReadiness(callback).wait(
      action,
      controller.signal,
    );
    const rejected = expect(pending).rejects.toBe(cause);
    expect(callback).toHaveBeenCalledWith({
      action,
      signal: controller.signal,
    });
    controller.abort(cause);
    await rejected;
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    await rs.advanceTimersByTimeAsync(5000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets the callback clean up its own work on cancellation', async () => {
    const controller = new AbortController();
    const cleanup = rs.fn();
    const pending = new ActionReadiness(({ signal }) => {
      return new Promise<void>((_resolve, reject) => {
        signal!.addEventListener(
          'abort',
          () => {
            cleanup();
            reject(signal!.reason);
          },
          { once: true },
        );
      });
    }).wait(action, controller.signal);
    const cause = new Error('stop waiting');
    const rejected = expect(pending).rejects.toBe(cause);
    controller.abort(cause);
    await rejected;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('does not invoke the callback when already cancelled', async () => {
    const controller = new AbortController();
    const cause = new Error('already cancelled');
    controller.abort(cause);
    const callback = rs.fn(async () => {});
    await expect(
      new ActionReadiness(callback).wait(action, controller.signal),
    ).rejects.toBe(cause);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)(
    'removes the cancellation listener after callback %s',
    async (outcome) => {
      const controller = new AbortController();
      const removeListener = rs.spyOn(controller.signal, 'removeEventListener');
      const readiness = new ActionReadiness(async () => {
        if (outcome === 'failure') throw new Error('not ready');
      });
      const pending = readiness.wait(action, controller.signal);
      if (outcome === 'failure')
        await expect(pending).rejects.toThrow('not ready');
      else await pending;
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
    },
  );

  it('handles a late callback rejection after cancellation', async () => {
    const controller = new AbortController();
    let reject!: (cause: Error) => void;
    const pending = new ActionReadiness(
      () =>
        new Promise<void>((_resolve, rej) => {
          reject = rej;
        }),
    ).wait(action, controller.signal);
    const cause = new Error('stop waiting');
    const rejected = expect(pending).rejects.toBe(cause);
    controller.abort(cause);
    await rejected;
    reject(new Error('late callback failure'));
    await Promise.resolve();
  });

  it('handles cancellation and a synchronous throw inside the callback', async () => {
    const controller = new AbortController();
    const cause = new Error('stop waiting');
    await expect(
      new ActionReadiness(() => {
        controller.abort(cause);
        throw new Error('callback failed after cancellation');
      }).wait(action, controller.signal),
    ).rejects.toBe(cause);
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
