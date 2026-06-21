import type { Size } from '@/types';
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
    return Math.round(
      (Math.abs(delta) * length) / coordinateSystem.normalizedBy,
    );
  };
}
