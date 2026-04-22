export const DISCOVERY_POLL_INTERVAL_MS = 5000;

interface ScheduleDiscoveryPollingOptions {
  intervalMs?: number;
  refresh: () => Promise<void>;
  setIntervalFn?: typeof globalThis.setInterval;
  setTimeoutFn?: typeof globalThis.setTimeout;
  clearIntervalFn?: typeof globalThis.clearInterval;
  clearTimeoutFn?: typeof globalThis.clearTimeout;
}

export function scheduleDiscoveryPolling({
  intervalMs = DISCOVERY_POLL_INTERVAL_MS,
  refresh,
  setIntervalFn = globalThis.setInterval,
  setTimeoutFn = globalThis.setTimeout,
  clearIntervalFn = globalThis.clearInterval,
  clearTimeoutFn = globalThis.clearTimeout,
}: ScheduleDiscoveryPollingOptions): () => void {
  let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;

  const timeoutId = setTimeoutFn(() => {
    void refresh();
    intervalId = setIntervalFn(() => {
      void refresh();
    }, intervalMs);
  }, intervalMs);

  return () => {
    clearTimeoutFn(timeoutId);
    if (intervalId !== null) {
      clearIntervalFn(intervalId);
    }
  };
}
