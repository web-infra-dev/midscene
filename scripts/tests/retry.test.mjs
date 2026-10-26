import { describe, expect, it, rs } from '@rstest/core';
import { getExponentialRetryDelayMs, retry } from '../retry.mjs';

describe('script retry helper', () => {
  it('returns a successful result without waiting', async () => {
    const operation = rs.fn().mockResolvedValue('result');
    const wait = rs.fn();
    const getDelayMs = rs.fn();

    await expect(
      retry(operation, { maxAttempts: 3, getDelayMs, wait }),
    ).resolves.toBe('result');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(getDelayMs).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries failures with the supplied backoff and attempt diagnostics', async () => {
    const firstError = new Error('first');
    const secondError = new Error('second');
    const operation = rs
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(secondError)
      .mockResolvedValue('recovered');
    const wait = rs.fn(async () => undefined);
    const onRetry = rs.fn();

    await expect(
      retry(operation, {
        maxAttempts: 3,
        getDelayMs: (attempt) => getExponentialRetryDelayMs(attempt, 5000),
        onRetry,
        wait,
      }),
    ).resolves.toBe('recovered');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[5000], [10000]]);
    expect(onRetry.mock.calls).toEqual([
      [{ error: firstError, attempt: 1, maxAttempts: 3, delayMs: 5000 }],
      [{ error: secondError, attempt: 2, maxAttempts: 3, delayMs: 10000 }],
    ]);
  });

  it('propagates a non-retryable error without scheduling another attempt', async () => {
    const error = new Error('permanent');
    const operation = rs.fn().mockRejectedValue(error);
    const wait = rs.fn();
    const onRetry = rs.fn();

    await expect(
      retry(operation, {
        maxAttempts: 3,
        getDelayMs: () => 5000,
        shouldRetry: () => false,
        onRetry,
        wait,
      }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it('preserves the final error and never waits after the last attempt', async () => {
    const finalError = new Error('final');
    const operation = rs
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValue(finalError);
    const wait = rs.fn(async () => undefined);

    await expect(
      retry(operation, { maxAttempts: 2, getDelayMs: () => 1000, wait }),
    ).rejects.toBe(finalError);

    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls).toEqual([[1000]]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid attempt budget: %s',
    async (maxAttempts) => {
      const operation = rs.fn();

      await expect(
        retry(operation, { maxAttempts, getDelayMs: () => 0 }),
      ).rejects.toThrow('maxAttempts must be a positive integer.');

      expect(operation).not.toHaveBeenCalled();
    },
  );

  it('supports exponential delays with an optional cap', () => {
    expect(getExponentialRetryDelayMs(0, 2000, 30000)).toBe(2000);
    expect(getExponentialRetryDelayMs(2, 2000, 30000)).toBe(4000);
    expect(getExponentialRetryDelayMs(6, 2000, 30000)).toBe(30000);
    expect(getExponentialRetryDelayMs(6, 2000)).toBe(64000);
  });
});
