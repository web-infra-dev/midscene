import type { Size } from '@/types';
import {
  normalizedCoordinateToPixel,
  roundPixelCoordinate,
} from './pixel-mapper';
import type { ResolvedLocateResultCoordinates } from './types';

export type CoordinateDistanceAxis = 'x' | 'y';

export function createCoordinateDistanceToPixels(
  size: Size,
  coordinateSystem: ResolvedLocateResultCoordinates,
) {
  return (delta: number, axis: CoordinateDistanceAxis): number => {
    const length = axis === 'x' ? size.width : size.height;
    const pixels =
      coordinateSystem.normalizedBy === undefined
        ? Math.abs(delta)
        : normalizedCoordinateToPixel(
            Math.abs(delta),
            coordinateSystem.normalizedBy,
            length,
            coordinateSystem.normalizationBasis,
          );
    return roundPixelCoordinate(pixels, coordinateSystem.rounding);
  };
}
