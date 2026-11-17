import type { ScrollGeometry } from '@/device';

/** Coherent child-frame translation is relative layout evidence, not contentOffset. */
export function relativeScrollTravel(
  current: ScrollGeometry,
  reference: ScrollGeometry,
) {
  if (
    current.targetId !== reference.targetId ||
    JSON.stringify(current.viewport) !== JSON.stringify(reference.viewport)
  )
    return undefined;
  const ids = Object.keys(current.anchors).filter(
    (id) => reference.anchors[id],
  );
  if (ids.length < 2) return undefined;
  const deltas = ids.map((id) => {
    const a = current.anchors[id];
    const b = reference.anchors[id];
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      // Native CGRect doubles may differ by a few ULPs after translation.
      sameSize: (['width', 'height'] as const).every(
        (axis) =>
          Math.abs(a[axis] - b[axis]) <=
          8 *
            Number.EPSILON *
            Math.max(1, Math.abs(a[axis]), Math.abs(b[axis])),
      ),
    };
  });
  const x = deltas.reduce((sum, d) => sum + d.x, 0) / deltas.length;
  const y = deltas.reduce((sum, d) => sum + d.y, 0) / deltas.length;
  if (
    !deltas.every(
      (d) => Math.abs(d.x - x) < 0.5 && Math.abs(d.y - y) < 0.5 && d.sameSize,
    )
  )
    return undefined;
  return { x: -x, y: -y, matchedAnchors: ids.length };
}

export function scrollGeometryFeedback(
  current: ScrollGeometry,
  reference: ScrollGeometry,
): string {
  const travel = relativeScrollTravel(current, reference);
  return `Fresh native scroll-view geometry: descendant bounds extend beyond the viewport on these sides: ${current.offscreenDirections.join(', ') || 'none observed'}. ${travel ? `Matching native child frames imply relative viewport travel since the first measured view: ${JSON.stringify(travel)}. Negative x means the viewport searched left, positive x means right; this is geometry-derived relative travel, not an absolute scroll offset or range.` : ''} These are observations, not a planned or executed action. They supersede earlier guesses that this content is only vertically navigable or requires a system Back gesture. If the original goal is already visibly satisfied, finish it. If only a cropped fragment of the requested target is visible, continue revealing that target instead of finishing. Movement alone is not task success. Otherwise consider a Scroll toward observed off-screen content on the intended region, respecting all explicit user directions, counts, distances and stopping conditions. Missing geometry on a side does not establish a boundary or prove the goal absent.`;
}
