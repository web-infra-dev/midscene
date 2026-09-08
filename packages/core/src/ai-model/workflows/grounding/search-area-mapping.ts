import type { Rect } from '@midscene/shared/types';
import type { PixelLocateResult } from '../../shared/model-locate-result';
import type { SearchAreaImageMapping } from './types';

/** Restore a complete locate result, keeping center independent from bbox metadata. */
export function mapSearchAreaResultToOriginalResult(
  result: PixelLocateResult,
  mapping?: SearchAreaImageMapping,
): PixelLocateResult {
  return {
    center: mapSearchAreaPointToOriginalPoint(result.center, mapping),
    ...(result.rect
      ? { rect: mapSearchAreaRectToOriginalRect(result.rect, mapping) }
      : {}),
  };
}

/** Restore the target point without intermediate rounding. */
export function mapSearchAreaPointToOriginalPoint(
  [x, y]: [number, number],
  mapping?: SearchAreaImageMapping,
): [number, number] {
  const { scale = 1, offset = { x: 0, y: 0 } } = mapping ?? {};
  return [x / scale + offset.x, y / scale + offset.y];
}

/** Restore bbox metadata independently from the target point. */
export function mapSearchAreaRectToOriginalRect(
  rect: Rect,
  mapping?: SearchAreaImageMapping,
): Rect {
  const [left, top] = mapSearchAreaPointToOriginalPoint(
    [rect.left, rect.top],
    mapping,
  );
  const scale = mapping?.scale ?? 1;
  return {
    left,
    top,
    width: (rect.width - 1) / scale + 1,
    height: (rect.height - 1) / scale + 1,
  };
}
