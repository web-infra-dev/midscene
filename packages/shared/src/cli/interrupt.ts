export type CliInterruptReason = 'sigint' | 'sigterm' | 'sighup' | 'watchdog';

type CliInterruptSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

export interface CliInterruptSource {
  on(event: CliInterruptSignal, listener: () => void): unknown;
  removeListener(event: CliInterruptSignal, listener: () => void): unknown;
}

export interface CliInterruptInputSource {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  readonly readableFlowing?: boolean | null;
  on(event: 'data', listener: (chunk: unknown) => void): unknown;
  removeListener(event: 'data', listener: (chunk: unknown) => void): unknown;
  setRawMode?(enabled: boolean): unknown;
  pause?(): unknown;
}

export interface CliInterruptWaiter {
  /** Resolves on the first stop signal or watchdog timeout. */
  readonly result: Promise<CliInterruptReason>;
  /** Release signal handlers after asynchronous finalization has completed. */
  dispose(): void;
}

const activeInterruptWaiters = new WeakMap<object, number>();
const noop = () => {};

function guardTerminalCtrlC(
  input: CliInterruptInputSource | undefined,
  onInterrupt: () => void,
): () => void {
  if (!input?.isTTY || !input.setRawMode) return noop;

  const wasRaw = input.isRaw === true;
  const wasFlowing = input.readableFlowing === true;
  const onData = (chunk: unknown) => {
    const includesCtrlC =
      (typeof chunk === 'string' && chunk.includes('\u0003')) ||
      (chunk instanceof Uint8Array && chunk.includes(3));
    if (includesCtrlC) onInterrupt();
  };
  const dispose = () => {
    input.removeListener('data', onData);
    try {
      if (!wasFlowing) input.pause?.();
    } finally {
      if (!wasRaw) input.setRawMode?.(false);
    }
  };

  input.setRawMode(true);
  try {
    input.on('data', onData);
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

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
 * Package runners such as pnpm can deliver SIGINT to the foreground child,
 * immediately follow it with SIGTERM, then cause SIGHUP when the runner exits
 * and its pseudo-terminal closes. Resolving on the first signal is not enough:
 * removing any handler at that point lets a subsequent signal kill the child
 * during asynchronous artifact finalization.
 *
 * On a TTY, Ctrl+C is captured as raw input so the package runner itself stays
 * alive until the child has saved and restored the terminal. Signal handlers
 * remain as the graceful-stop path for externally delivered termination.
 */
export function createCliInterruptWaiter(
  watchdogMs: number,
  source: CliInterruptSource = process,
  input: CliInterruptInputSource | undefined = source === process
    ? process.stdin
    : undefined,
): CliInterruptWaiter {
  const unregisterWaiter = registerCliInterruptWaiter(source);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let disposed = false;
  let disposeInput = noop;
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
  const onSighup = () => finish('sighup');

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    source.removeListener('SIGINT', onSigint);
    source.removeListener('SIGTERM', onSigterm);
    source.removeListener('SIGHUP', onSighup);
    try {
      disposeInput();
    } finally {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      unregisterWaiter();
    }
  };

  try {
    source.on('SIGINT', onSigint);
    source.on('SIGTERM', onSigterm);
    source.on('SIGHUP', onSighup);
    disposeInput = guardTerminalCtrlC(input, onSigint);
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
  input: CliInterruptInputSource | undefined = source === process
    ? process.stdin
    : undefined,
): Promise<CliInterruptReason> {
  const waiter = createCliInterruptWaiter(watchdogMs, source, input);
  return waiter.result.finally(waiter.dispose);
}
