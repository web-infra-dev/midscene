import type { Size } from '@midscene/core';
import type { PointerPoint } from '@midscene/core/device';

/** Keep a screen-space point inside the half-open pixel bounds. */
export function clampPointerPointToSize(
  point: PointerPoint,
  size: Size,
): PointerPoint {
  const maximumX = Math.max(0, Math.floor(size.width) - 1);
  const maximumY = Math.max(0, Math.floor(size.height) - 1);
  return {
    x: Math.max(0, Math.min(point.x, maximumX)),
    y: Math.max(0, Math.min(point.y, maximumY)),
  };
}
