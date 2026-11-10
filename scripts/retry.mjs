import { setTimeout as delay } from 'node:timers/promises';

export function getExponentialRetryDelayMs(
  attempt,
  baseDelayMs,
  maxDelayMs = Number.POSITIVE_INFINITY,
) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (Math.max(1, attempt) - 1));
}

/**
 * Run an operation up to maxAttempts times, including the initial attempt.
 * By default all failures are retryable. getDelayMs receives the failed,
 * one-based attempt; onRetry runs only when another attempt will follow.
 * Non-retryable and final errors are rethrown unchanged.
 */
export async function retry(
  operation,
  { maxAttempts, getDelayMs, shouldRetry = () => true, onRetry, wait = delay },
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = getDelayMs(attempt);
      onRetry?.({ error, attempt, maxAttempts, delayMs });
      await wait(delayMs);
    }
  }
}
