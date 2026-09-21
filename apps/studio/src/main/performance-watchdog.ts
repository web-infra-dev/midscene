import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { getDebug } from '@midscene/shared/logger';

const debugEventLoop = getDebug('studio:event-loop', { console: true });
const SAMPLE_INTERVAL_MS = 1000;
const STALL_WARNING_MS = 500;

export function startStudioEventLoopWatchdog(): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let expectedAt = performance.now() + SAMPLE_INTERVAL_MS;

  const timer = setInterval(() => {
    const now = performance.now();
    const driftMs = Math.max(0, now - expectedAt);
    expectedAt = now + SAMPLE_INTERVAL_MS;

    const maxMs = histogram.max / 1e6;
    const p99Ms = histogram.percentile(99) / 1e6;
    if (driftMs >= STALL_WARNING_MS || maxMs >= STALL_WARNING_MS) {
      const memory = process.memoryUsage();
      debugEventLoop(
        'main event loop stalled: drift=%dms, p99=%dms, max=%dms, rss=%dMB, heapUsed=%dMB',
        Math.round(driftMs),
        Math.round(p99Ms),
        Math.round(maxMs),
        Math.round(memory.rss / 1024 / 1024),
        Math.round(memory.heapUsed / 1024 / 1024),
      );
    }
    histogram.reset();
  }, SAMPLE_INTERVAL_MS);
  timer.unref();

  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
