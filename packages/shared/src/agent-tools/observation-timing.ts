import { z } from 'zod';
import type { UIObservationTiming } from './types';

/** Bounds in one explicitly named clock domain, never implicitly wall time. */
export const observationTimingSchema = z
  .object({
    clockId: z.string().min(1),
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite().nonnegative(),
    kind: z.enum(['capture-interval', 'compositor-frame', 'input-event']),
  })
  .strict()
  .refine((t) => t.endMs >= t.startMs, {
    path: ['endMs'],
    message: 'must not precede startMs',
  });

/** No clock conversion or choice of input trigger is inferred by this function. */
export function observationLatencyBounds(
  trigger: UIObservationTiming,
  lastOld: UIObservationTiming,
  firstNew: UIObservationTiming,
  thresholdMs: number,
) {
  for (const timing of [trigger, lastOld, firstNew])
    observationTimingSchema.parse(timing);
  if (
    trigger.clockId !== lastOld.clockId ||
    trigger.clockId !== firstNew.clockId
  ) {
    throw new Error(
      'Observation latency requires the same verified clock domain',
    );
  }
  if (!Number.isFinite(thresholdMs) || thresholdMs < 0)
    throw new Error('Invalid latency threshold');
  if (lastOld.startMs > firstNew.startMs || firstNew.endMs < trigger.startMs) {
    throw new Error('Observation boundary is not ordered after the trigger');
  }
  const lowerMs = Math.max(0, lastOld.startMs - trigger.endMs);
  const upperMs = firstNew.endMs - trigger.startMs;
  return {
    lowerMs,
    upperMs,
    thresholdMs,
    status:
      upperMs <= thresholdMs
        ? 'pass'
        : lowerMs > thresholdMs
          ? 'fail'
          : 'inconclusive',
  } as const;
}
