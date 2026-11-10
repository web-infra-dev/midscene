export interface RetryContext {
  error: unknown;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export interface RetryOptions {
  maxAttempts: number;
  getDelayMs: (attempt: number) => number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (context: RetryContext) => void;
  wait?: (delayMs: number) => Promise<unknown>;
}

export declare function getExponentialRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs?: number,
): number;

export declare function retry<Result>(
  operation: () => Result | PromiseLike<Result>,
  options: RetryOptions,
): Promise<Awaited<Result>>;
