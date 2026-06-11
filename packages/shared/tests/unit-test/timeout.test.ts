import { describe, expect, it, vi } from 'vitest';
import { PromiseTimeoutError, withTimeout } from '../../src/timeout';

describe('withTimeout', () => {
  it('resolves when the promise completes before the timeout', async () => {
    await expect(
      withTimeout(Promise.resolve('ok'), 100, 'timed out'),
    ).resolves.toBe('ok');
  });

  it('rejects with PromiseTimeoutError when the promise takes too long', async () => {
    vi.useFakeTimers();

    const pendingPromise = new Promise<string>(() => {});
    const result = withTimeout(pendingPromise, 100, 'scrcpy timed out');
    const expectation = expect(result).rejects.toEqual(
      expect.objectContaining<Partial<PromiseTimeoutError>>({
        name: 'PromiseTimeoutError',
        message: 'scrcpy timed out',
        timeoutMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    vi.useRealTimers();
  });

  it('runs late cleanup when the promise resolves after timing out', async () => {
    vi.useFakeTimers();

    let resolvePromise: (value: { close: () => Promise<void> }) => void =
      () => {
        throw new Error('pending promise resolver was not initialized');
      };
    const close = vi.fn().mockResolvedValue(undefined);
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
    const expectation =
      expect(result).rejects.toBeInstanceOf(PromiseTimeoutError);

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    resolvePromise({ close });
    await vi.runAllTicks();
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('runs late rejection cleanup when the promise rejects after timing out', async () => {
    vi.useFakeTimers();

    let rejectPromise: (error: unknown) => void = () => {
      throw new Error('pending promise rejecter was not initialized');
    };
    const onRejectedAfterTimeout = vi.fn();
    const pendingPromise = new Promise<string>((_, reject) => {
      rejectPromise = reject;
    });
    const result = withTimeout(pendingPromise, 100, 'scrcpy timed out', {
      onRejectedAfterTimeout,
    });
    const expectation =
      expect(result).rejects.toBeInstanceOf(PromiseTimeoutError);

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    const lateError = new Error('late failure');
    rejectPromise(lateError);
    await vi.runAllTicks();
    await Promise.resolve();

    expect(onRejectedAfterTimeout).toHaveBeenCalledWith(lateError);
    vi.useRealTimers();
  });
});
