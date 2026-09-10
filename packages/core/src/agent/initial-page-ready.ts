import type { WaitForInitialPageReadyOptions } from '@/types';
import { getErrorMessage } from '@midscene/shared/agent-tools/error-formatter';

/** A lazy, shared readiness result for one Agent's initial page. */
export class InitialPageReady {
  private readonly controller = new AbortController();
  private promise?: Promise<void>;

  constructor(private readonly options: WaitForInitialPageReadyOptions) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error(
        'waitForInitialPageReady must be an object with a handler function',
      );
    }
    if (typeof options.handler !== 'function') {
      throw new Error('waitForInitialPageReady.handler must be a function');
    }
    const { timeoutMs } = options;
    if (
      timeoutMs !== undefined &&
      (!Number.isInteger(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 2_147_483_647)
    ) {
      throw new Error(
        'waitForInitialPageReady.timeoutMs must be a positive integer no greater than 2147483647',
      );
    }
  }

  wait(): Promise<void> {
    // Retain failures too: later calls must not silently retry initialization.
    this.promise ??= this.run();
    return this.promise;
  }

  abort(): void {
    this.controller.abort(
      new Error('Agent destroyed during initial page readiness'),
    );
  }

  private async run(): Promise<void> {
    const { handler, timeoutMs = 10_000 } = this.options;
    const { signal } = this.controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        onAbort = () => reject(signal.reason);
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          () =>
            this.controller.abort(new Error(`Timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        // Start after wait() stores the shared promise. Consume late rejection
        // even if a non-cooperative handler outlives timeout or destruction.
        Promise.resolve()
          .then(() => {
            signal.throwIfAborted();
            return handler({ signal });
          })
          .then(resolve, reject);
      });
    } catch (cause) {
      throw new Error(
        `waitForInitialPageReady failed: ${getErrorMessage(cause)}`,
        { cause },
      );
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }
}
