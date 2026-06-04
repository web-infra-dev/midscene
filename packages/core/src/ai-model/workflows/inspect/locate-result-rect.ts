import type { PixelBbox } from '@/ai-model/shared/model-locate-result';
import type { Rect } from '@/types';

export function mergePixelBboxesToRect(pixelBboxes: PixelBbox[]): Rect {
  const minLeft = Math.min(...pixelBboxes.map(([left]) => left));
  const minTop = Math.min(...pixelBboxes.map(([, top]) => top));
  const maxRight = Math.max(...pixelBboxes.map(([, , right]) => right));
  const maxBottom = Math.max(...pixelBboxes.map(([, , , bottom]) => bottom));
  return pixelBboxToRect([minLeft, minTop, maxRight, maxBottom]);
}

export function pixelBboxToRect([left, top, right, bottom]: PixelBbox): Rect {
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}
