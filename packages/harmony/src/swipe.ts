import type { PointerPoint } from '@midscene/core/device';
import { getDebug } from '@midscene/shared/logger';
import { uiInputSpeedRange } from './hdc-constraints';

const defaultSwipeDuration = 300;
const warnSwipe = getDebug('harmony:swipe', { console: true });

export function resolveSwipeSpeed(
  start: PointerPoint,
  end: PointerPoint,
  duration = defaultSwipeDuration,
): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Harmony swipe duration must be a positive finite number');
  }

  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const requestedSpeed = (distance * 1000) / duration;
  const speed = Math.min(
    uiInputSpeedRange.max,
    Math.max(uiInputSpeedRange.min, requestedSpeed),
  );

  if (speed !== requestedSpeed) {
    warnSwipe(
      `Harmony swipe speed ${requestedSpeed}px/s was clamped to ${speed}px/s; the requested ${duration}ms duration cannot be represented exactly`,
    );
  }

  return Math.round(speed);
}
