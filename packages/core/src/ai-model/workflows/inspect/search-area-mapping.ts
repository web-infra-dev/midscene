import type { PixelBbox } from '@/ai-model/shared/model-locate-result';
import type { SearchAreaImageMapping } from './types';

export function mapSearchAreaPixelBboxToOriginalPixelBbox(
  [left, top, right, bottom]: PixelBbox,
  mapping?: SearchAreaImageMapping,
): PixelBbox {
  const offset = mapping?.offset ?? { x: 0, y: 0 };
  const scale = mapping?.scale ?? 1;
  const mapX = (x: number) =>
    (scale !== 1 ? Math.round(x / scale) : x) + offset.x;
  const mapY = (y: number) =>
    (scale !== 1 ? Math.round(y / scale) : y) + offset.y;

  return [mapX(left), mapY(top), mapX(right), mapY(bottom)];
}
