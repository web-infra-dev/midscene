export type CliInterruptReason = 'sigint' | 'watchdog';

export interface CliInterruptSource {
  once(event: 'SIGINT', listener: () => void): unknown;
  removeListener(event: 'SIGINT', listener: () => void): unknown;
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
 * Wait until the foreground CLI receives Ctrl+C. A positive watchdog keeps a
 * forgotten recording from running forever and uses the same graceful save
 * path as an explicit interrupt.
 */
export function waitForCliInterrupt(
  watchdogMs: number,
  source: CliInterruptSource = process,
): Promise<CliInterruptReason> {
  const unregisterWaiter = registerCliInterruptWaiter(source);

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;

    const finish = (reason: CliInterruptReason) => {
      if (finished) return;
      finished = true;
      source.removeListener('SIGINT', onSigint);
      if (timer) clearTimeout(timer);
      unregisterWaiter();
      resolve(reason);
    };
    const onSigint = () => finish('sigint');

    try {
      source.once('SIGINT', onSigint);
    } catch (error) {
      unregisterWaiter();
      reject(error);
      return;
    }
    if (watchdogMs > 0) {
      timer = setTimeout(() => finish('watchdog'), watchdogMs);
    }
  });
}
