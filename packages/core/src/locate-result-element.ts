import type { LocateResultElement, Rect } from './types';

/**
 * Create a LocateResultElement from a point.
 * This function creates an expanded rect around the given center point.
 *
 * Note: Center coordinates should be integers for pixel-aligned positioning.
 * If decimal values are provided, they will be used as-is, which may result in
 * non-pixel-aligned rect positions.
 *
 * Rect positioning behavior:
 * - When edgeSize is even, the point lands on the top-left pixel of the four
 *   center pixels.
 * - When edgeSize is odd, the point lands on the exact middle pixel.
 *
 * @param center - Center point coordinates as [x, y] (should be integers)
 * @param description - Description of the element
 * @param edgeSize - Size to expand around the center point (default: 8)
 * @returns A LocateResultElement with rect, center, and description
 */
export function createLocateResultElementFromPoint(
  center: [number, number],
  description: string,
  edgeSize = 8,
): LocateResultElement {
  const [centerX, centerY] = center;
  const offset = Math.ceil(edgeSize / 2) - 1;
  const expandedRect = {
    left: Math.max(centerX - offset, 0),
    top: Math.max(centerY - offset, 0),
    width: edgeSize,
    height: edgeSize,
  };

  return {
    rect: expandedRect,
    center: [centerX, centerY],
    description: description || '',
  };
}

/**
 * Create a LocateResultElement from a rect.
 * This function calculates the center point from the rect and preserves the
 * original rect as the returned element boundary.
 *
 * Note: The rect uses inclusive coordinates where:
 * - A rect from [left=10, top=10] with [width=1, height=1] covers exactly 1 pixel
 * - The actual pixel range is [left, left+width) which means width pixels
 *
 * Center calculation behavior:
 * - When width/height is even, centerX/Y lands on the top-left pixel of the
 *   four center pixels.
 * - When width/height is odd, centerX/Y lands on the exact middle pixel.
 *
 * @param sourceRect - The source rect to generate element from
 * @param description - Description of the element
 * @param edgeSize - Deprecated, retained for backward compatibility
 * @returns A LocateResultElement with the original rect, center, and description
 */
export function createLocateResultElementFromRect(
  sourceRect: Rect,
  description: string,
  _edgeSize = 8,
): LocateResultElement {
  const centerX = sourceRect.left + Math.floor((sourceRect.width - 1) / 2);
  const centerY = sourceRect.top + Math.floor((sourceRect.height - 1) / 2);

  return {
    rect: sourceRect,
    center: [centerX, centerY],
    description: description || '',
  };
}
