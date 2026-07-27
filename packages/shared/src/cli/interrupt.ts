export type CliInterruptReason = 'sigint' | 'watchdog';

export interface CliInterruptSource {
  once(event: 'SIGINT', listener: () => void): unknown;
  removeListener(event: 'SIGINT', listener: () => void): unknown;
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
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (reason: CliInterruptReason) => {
      source.removeListener('SIGINT', onSigint);
      if (timer) clearTimeout(timer);
      resolve(reason);
    };
    const onSigint = () => finish('sigint');

    source.once('SIGINT', onSigint);
    if (watchdogMs > 0) {
      timer = setTimeout(() => finish('watchdog'), watchdogMs);
    }
  });
}
