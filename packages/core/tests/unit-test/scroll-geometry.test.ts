import {
  relativeScrollTravel,
  scrollGeometryFeedback,
} from '@/agent/scroll-geometry';
import type { ScrollGeometry } from '@/device';
import { expect, it } from '@rstest/core';

const geometry = (x = 0): ScrollGeometry => ({
  targetId: 'view',
  viewport: { x: 0, y: 0, width: 100, height: 200 },
  offscreenDirections: ['left'],
  anchors: {
    a: { x: 20 + x, y: 30, width: 30, height: 20 },
    b: { x: 50 + x, y: 60, width: 30, height: 20 },
  },
});
it('derives relative viewport travel from coherent, unchanged-size child frames', () => {
  const travel = relativeScrollTravel(geometry(40), geometry())!;
  expect(travel.x).toBe(-40);
  expect(travel.matchedAnchors).toBe(2);
  expect(scrollGeometryFeedback(geometry(40), geometry())).toContain(
    'not an absolute scroll offset or range',
  );
});
it.each(['target', 'resize', 'one-anchor', 'reflow', 'child-resize'])(
  'withholds travel when correspondence is unreliable: %s',
  (kind) => {
    const current = geometry(40);
    if (kind === 'target') current.targetId = 'other';
    if (kind === 'resize') current.viewport.width = 101;
    if (kind === 'one-anchor') current.anchors = { a: current.anchors.a };
    if (kind === 'reflow') current.anchors.b.x += 20;
    if (kind === 'child-resize') current.anchors.b.width += 20;
    expect(relativeScrollTravel(current, geometry())).toBeUndefined();
  },
);
it('preserves explicit instructions and does not treat missing geometry as a boundary', () => {
  const text = scrollGeometryFeedback(
    { ...geometry(), offscreenDirections: [] },
    geometry(),
  );
  expect(text).toContain(
    'respecting all explicit user directions, counts, distances and stopping conditions',
  );
  expect(text).toContain(
    'Missing geometry on a side does not establish a boundary',
  );
  expect(text).toContain(
    'If the original goal is already visibly satisfied, finish it',
  );
});

it('ignores only floating-point size noise while rejecting real subpoint resizing', () => {
  const current = geometry(40);
  current.anchors.b.width += 1e-14;
  expect(relativeScrollTravel(current, geometry())?.x).toBe(-40);
  current.anchors.b.width += 0.001;
  expect(relativeScrollTravel(current, geometry())).toBeUndefined();
});
