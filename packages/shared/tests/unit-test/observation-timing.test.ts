import {
  observationLatencyBounds,
  observationTimingSchema,
} from '@/agent-tools/observation-timing';
import type { UIObservationTiming } from '@/agent-tools/types';
import { describe, expect, it } from '@rstest/core';
const t = (
  startMs: number,
  endMs = startMs,
  clockId = 'guest:boot',
): UIObservationTiming => ({
  startMs,
  endMs,
  clockId,
  kind: 'capture-interval',
});
describe('conservative latency bounds', () => {
  it('does not use capture start to pass a target first seen during [480,560]', () => {
    expect(
      observationLatencyBounds(t(0), t(440), t(480, 560), 500),
    ).toMatchObject({ upperMs: 560, status: 'inconclusive' });
  });
  it('does not use capture end to fail an old frame sampled during [480,560]', () => {
    expect(
      observationLatencyBounds(t(0), t(480, 560), t(570), 500),
    ).toMatchObject({ lowerMs: 480, status: 'inconclusive' });
  });
  it('keeps source time independent of encoding or delivery delays', () => {
    expect(observationLatencyBounds(t(0), t(440), t(470), 500).status).toBe(
      'pass',
    );
  });
  it('does not replace a 120ms gap with average frame cadence', () => {
    expect(observationLatencyBounds(t(0), t(440), t(560), 500).status).toBe(
      'inconclusive',
    );
  });
  it('preserves the full keypress interval instead of quietly selecting release', () => {
    expect(
      observationLatencyBounds(t(0, 80), t(536), t(633), 500),
    ).toMatchObject({ lowerMs: 456, upperMs: 633, status: 'inconclusive' });
    expect(observationLatencyBounds(t(0), t(536), t(633), 500).status).toBe(
      'fail',
    );
  });
  it('uses inclusive pass and strict fail boundaries', () => {
    expect(observationLatencyBounds(t(0), t(490), t(500), 500).status).toBe(
      'pass',
    );
    expect(observationLatencyBounds(t(0), t(500), t(510), 500).status).toBe(
      'inconclusive',
    );
    expect(observationLatencyBounds(t(0), t(500.001), t(510), 500).status).toBe(
      'fail',
    );
  });
  it('rejects mixed boot/host clocks, reversed bounds, and unordered frames', () => {
    expect(() =>
      observationLatencyBounds(t(0), t(400), t(450, 450, 'host:boot'), 500),
    ).toThrow('clock');
    expect(observationTimingSchema.safeParse(t(20, 10)).success).toBe(false);
    expect(() => observationLatencyBounds(t(0), t(450), t(400), 500)).toThrow(
      'ordered',
    );
  });
  it('keeps all seven historical crossing intervals inconclusive', () => {
    for (const [lower, upper] of [
      [456.608053, 633.369428],
      [470.298209, 647.222422],
      [345.617917, 521.974381],
      [415.304055, 592.224031],
      [400.767381, 577.006723],
      [406.955762, 584.946786],
      [391.753949, 568.520219],
    ]) {
      expect(
        observationLatencyBounds(t(0), t(lower), t(upper), 500).status,
      ).toBe('inconclusive');
    }
  });
});
