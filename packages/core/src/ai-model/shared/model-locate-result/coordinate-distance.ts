import type { Size } from '@/types';
import { normalizedCoordinateToPixel } from './pixel-mapper';
import type { ResolvedLocateResultCoordinates } from './types';

export type CoordinateDistanceAxis = 'x' | 'y';

export function createCoordinateDistanceToPixels(
  size: Size,
  coordinateSystem: ResolvedLocateResultCoordinates,
) {
  return (delta: number, axis: CoordinateDistanceAxis): number => {
    if (coordinateSystem.normalizedBy === undefined) {
      return Math.round(Math.abs(delta));
    }

    const length = axis === 'x' ? size.width : size.height;
    return normalizedCoordinateToPixel(
      Math.abs(delta),
      coordinateSystem.normalizedBy,
      length,
      coordinateSystem.rounding,
    );
  };
}
