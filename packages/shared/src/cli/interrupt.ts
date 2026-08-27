export type CliInterruptReason = 'sigint' | 'sigterm' | 'watchdog';

type CliInterruptSignal = 'SIGINT' | 'SIGTERM';

export interface CliInterruptSource {
  on(event: CliInterruptSignal, listener: () => void): unknown;
  removeListener(event: CliInterruptSignal, listener: () => void): unknown;
}

export interface CliInterruptWaiter {
  /** Resolves on the first stop signal or watchdog timeout. */
  readonly result: Promise<CliInterruptReason>;
  /** Release signal handlers after asynchronous finalization has completed. */
  dispose(): void;
}

const activeInterruptWaiters = new WeakMap<object, number>();

function registerCliInterruptWaiter(source: CliInterruptSource): () => void {
  const key = source as object;
  activeInterruptWaiters.set(key, (activeInterruptWaiters.get(key) ?? 0) + 1);

  let active = true;
  return () => {
    if (!active) return;
    active = false;

    const remaining = (activeInterruptWaiters.get(key) ?? 1) - 1;
    if (remaining > 0) {
      activeInterruptWaiters.set(key, remaining);
    } else {
      activeInterruptWaiters.delete(key);
    }
  };
}

/** Whether a foreground CLI command is currently waiting for this source. */
export function hasActiveCliInterruptWaiter(
  source: CliInterruptSource = process,
): boolean {
  return (activeInterruptWaiters.get(source as object) ?? 0) > 0;
}

/**
 * Keep graceful-stop handlers installed until the caller has finished saving.
 *
 * Package runners such as pnpm can deliver SIGINT to the foreground child and
 * immediately follow it with SIGTERM while shutting down their own process.
 * Resolving on the first signal is not enough: removing the handlers at that
 * point lets the forwarded SIGTERM kill the child during asynchronous artifact
 * finalization.
 */
export function createCliInterruptWaiter(
  watchdogMs: number,
  source: CliInterruptSource = process,
): CliInterruptWaiter {
  const unregisterWaiter = registerCliInterruptWaiter(source);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let disposed = false;
  let resolveResult!: (reason: CliInterruptReason) => void;
  let rejectResult!: (error: unknown) => void;

  const result = new Promise<CliInterruptReason>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (reason: CliInterruptReason) => {
    if (finished) return;
    finished = true;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    resolveResult(reason);
  };
  const onSigint = () => finish('sigint');
  const onSigterm = () => finish('sigterm');

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    source.removeListener('SIGINT', onSigint);
    source.removeListener('SIGTERM', onSigterm);
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    unregisterWaiter();
  };

  try {
    source.on('SIGINT', onSigint);
    source.on('SIGTERM', onSigterm);
    if (watchdogMs > 0) {
      timer = setTimeout(() => finish('watchdog'), watchdogMs);
    }
  } catch (error) {
    dispose();
    rejectResult(error);
  }

  return { result, dispose };
}

/**
 * Wait for one stop request and release the handlers immediately afterwards.
 * Long-running finalizers should use {@link createCliInterruptWaiter} instead.
 */
export function waitForCliInterrupt(
  watchdogMs: number,
  source: CliInterruptSource = process,
): Promise<CliInterruptReason> {
  const waiter = createCliInterruptWaiter(watchdogMs, source);
  return waiter.result.finally(waiter.dispose);
}
