import type { Point } from './transport/types';

/**
 * Pure gesture math, mirroring the conventions already shipped by
 * `packages/android` so both paths send identical gestures:
 *
 * - start point sits on the screen quarter that leaves the most travel room
 *   (`n = 4`), so a full-viewport scroll never starts or ends off-screen;
 * - `down`/`up` describe the off-screen content to reveal, not the finger
 *   direction (`down` => finger moves up);
 * - the applied distance is clamped to the available travel.
 *
 * This module is the first candidate for the Phase 1 convergence where
 * `packages/android` consumes android-local's pure logic (P1-7).
 */

export const SCROLL_DIVISIONS = 4;
export const DEFAULT_SCROLL_DURATION_MS = 1000;
export const FAST_SCROLL_DURATION_MS = 100;
export const DEFAULT_SCROLL_SETTLE_MS = 1000;
/** `scrollToTop`/`scrollToBottom` style scrolling repeats this many times. */
export const DEFAULT_SCROLL_UNTIL_TIMES = 10;

export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * How far a gesture can travel from `start` in the requested direction, capped
 * by the requested distance.
 */
function clampToAvailable(
  delta: number,
  start: number,
  maxSize: number,
): number {
  const available = delta > 0 ? maxSize - start : start;
  return Math.min(Math.abs(delta), available);
}

/**
 * Convert a scroll delta into a swipe gesture covering the whole screen.
 *
 * Signs follow `packages/android`'s `scrollRaw`: the gesture endpoint is
 * `start - delta`, so `direction: 'down'` (positive deltaY) moves the finger
 * up and reveals the content below.
 */
export function computeScrollGesture(
  size: ScreenSize,
  deltaX: number,
  deltaY: number,
): { start: Point; end: Point } {
  if (deltaX === 0 && deltaY === 0) {
    throw new Error('Scroll distance cannot be zero in both directions');
  }

  const { width, height } = size;
  const startX = Math.round(
    deltaX < 0
      ? (SCROLL_DIVISIONS - 1) * (width / SCROLL_DIVISIONS)
      : width / SCROLL_DIVISIONS,
  );
  const startY = Math.round(
    deltaY < 0
      ? (SCROLL_DIVISIONS - 1) * (height / SCROLL_DIVISIONS)
      : height / SCROLL_DIVISIONS,
  );

  // Reversing the delta turns the scroll convention into finger movement.
  const movementX = -deltaX;
  const movementY = -deltaY;

  return {
    start: { x: startX, y: startY },
    end: computeDragEndPoint(
      { x: startX, y: startY },
      {
        x: movementX,
        y: movementY,
      },
      size,
    ),
  };
}

/**
 * Compute the end point of a drag that starts at `start` and moves by `delta`
 * (positive values increase the coordinate), clamped to the screen bounds.
 */
export function computeDragEndPoint(
  start: Point,
  delta: { x: number; y: number },
  size: ScreenSize,
): Point {
  const appliedX =
    delta.x === 0 ? 0 : clampToAvailable(delta.x, start.x, size.width);
  const appliedY =
    delta.y === 0 ? 0 : clampToAvailable(delta.y, start.y, size.height);

  const endX =
    delta.x === 0 ? start.x : start.x + Math.sign(delta.x) * appliedX;
  const endY =
    delta.y === 0 ? start.y : start.y + Math.sign(delta.y) * appliedY;

  return { x: Math.round(endX), y: Math.round(endY) };
}

export interface ScrollRequest {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number | null;
  startPoint?: Point;
}

/** Map a scroll request onto the swipe (or drag) gesture that performs it. */
export function computeScrollRequest(
  request: ScrollRequest,
  size: ScreenSize,
): { start: Point; end: Point } {
  const direction = request.direction ?? 'down';
  const explicitDistance = request.distance ?? undefined;
  const signedDistance =
    direction === 'up' || direction === 'left'
      ? -(explicitDistance ?? (direction === 'up' ? size.height : size.width))
      : (explicitDistance ?? (direction === 'down' ? size.height : size.width));

  if (request.startPoint) {
    const start = {
      x: Math.round(request.startPoint.x),
      y: Math.round(request.startPoint.y),
    };
    const scrollDeltaX =
      direction === 'left' || direction === 'right' ? signedDistance : 0;
    const scrollDeltaY =
      direction === 'up' || direction === 'down' ? signedDistance : 0;
    // Same reversal as the full-viewport path: scroll deltas describe the
    // content to reveal, drag endpoints describe finger movement.
    return {
      start,
      end: computeDragEndPoint(
        start,
        { x: -scrollDeltaX, y: -scrollDeltaY },
        size,
      ),
    };
  }

  const deltaX =
    direction === 'left' || direction === 'right' ? signedDistance : 0;
  const deltaY =
    direction === 'up' || direction === 'down' ? signedDistance : 0;
  return computeScrollGesture(size, deltaX, deltaY);
}

/** Full-viewport delta for the "scroll all the way" variants. */
export function scrollUntilDelta(direction: 'up' | 'down' | 'left' | 'right'): {
  x: number;
  y: number;
} {
  // A huge delta is clamped internally, which yields a full-viewport gesture.
  const huge = 9_999_999;
  switch (direction) {
    case 'down':
      return { x: 0, y: huge };
    case 'up':
      return { x: 0, y: -huge };
    case 'right':
      return { x: huge, y: 0 };
    default:
      return { x: -huge, y: 0 };
  }
}
