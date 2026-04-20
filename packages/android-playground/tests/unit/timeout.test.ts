import { describe, expect, it, vi } from 'vitest';
import { type PromiseTimeoutError, withTimeout } from '../../src/timeout';

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

    let resolvePromise:
      | ((value: { close: () => Promise<void> }) => void)
      | null = null;
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
    const expectation = expect(result).rejects.toEqual(
      expect.objectContaining<Partial<PromiseTimeoutError>>({
        name: 'PromiseTimeoutError',
        timeoutMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
    resolvePromise?.({ close });
    await vi.runAllTicks();
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
