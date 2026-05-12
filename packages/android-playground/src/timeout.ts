export class PromiseTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'PromiseTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface WithTimeoutOptions<T> {
  onTimeout?: () => void | Promise<void>;
  onSettledAfterTimeout?: (value: T) => void | Promise<void>;
  onRejectedAfterTimeout?: (error: unknown) => void | Promise<void>;
}

function runTimeoutCallback(
  callback: (() => void | Promise<void>) | undefined,
  context: string,
) {
  if (!callback) {
    return;
  }

  void Promise.resolve()
    .then(callback)
    .catch((error) => {
      console.error(`Failed to run ${context}:`, error);
    });
}

export function withTimeout<T>(
  promise: PromiseLike<T> | T,
  timeoutMs: number,
  message: string,
  options: WithTimeoutOptions<T> = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      runTimeoutCallback(options.onTimeout, 'timeout callback');
      reject(new PromiseTimeoutError(message, timeoutMs));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        if (timedOut) {
          runTimeoutCallback(
            () => options.onSettledAfterTimeout?.(value),
            'post-timeout settle callback',
          );
          return;
        }

        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        if (timedOut) {
          runTimeoutCallback(
            () => options.onRejectedAfterTimeout?.(error),
            'post-timeout rejection callback',
          );
          return;
        }

        reject(error);
      },
    );
  });
}
