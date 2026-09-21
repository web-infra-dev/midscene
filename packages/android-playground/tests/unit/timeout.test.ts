import { describe, expect, it, rs } from '@rstest/core';
import { type PromiseTimeoutError, withTimeout } from '../../src/timeout';

describe('withTimeout', () => {
  it('resolves when the promise completes before the timeout', async () => {
    await expect(
      withTimeout(Promise.resolve('ok'), 100, 'timed out'),
    ).resolves.toBe('ok');
  });

  it('rejects with PromiseTimeoutError when the promise takes too long', async () => {
    rs.useFakeTimers();

    const pendingPromise = new Promise<string>(() => {});
    const result = withTimeout(pendingPromise, 100, 'scrcpy timed out');
    const expectation = expect(result).rejects.toEqual(
      expect.objectContaining<Partial<PromiseTimeoutError>>({
        name: 'PromiseTimeoutError',
        message: 'scrcpy timed out',
        timeoutMs: 100,
      }),
    );

    await rs.advanceTimersByTimeAsync(100);
    await expectation;
    rs.useRealTimers();
  });

  it('runs late cleanup when the promise resolves after timing out', async () => {
    rs.useFakeTimers();

    let resolvePromise: (value: { close: () => Promise<void> }) => void =
      () => {
        throw new Error('pending promise resolver was not initialized');
      };
    const close = rs.fn().mockResolvedValue(undefined);
    const pendingPromise = new Promise<{ close: () => Promise<void> }>(
      (resolve) => {
        resolvePromise = resolve;
      },
    );
    const result = withTimeout(pendingPromise, 100, 'scrcpy timed out', {
      onSettledAfterTimeout: async (client) => {
        await client.close();
      },
    });
    const expectation = expect(result).rejects.toEqual(
      expect.objectContaining<Partial<PromiseTimeoutError>>({
        name: 'PromiseTimeoutError',
        timeoutMs: 100,
      }),
    );

    await rs.advanceTimersByTimeAsync(100);
    await expectation;
    resolvePromise({ close });
    await rs.runAllTicks();
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
    rs.useRealTimers();
  });
});
