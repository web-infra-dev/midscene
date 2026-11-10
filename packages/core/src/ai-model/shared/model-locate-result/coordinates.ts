import type {
  LocateResultCoordinates,
  ResolvedLocateResultCoordinates,
} from './types';

export function resolveLocateResultCoordinates(
  coordinates: LocateResultCoordinates,
): ResolvedLocateResultCoordinates {
  if (coordinates.normalizedBy !== undefined && coordinates.normalizedBy <= 0) {
    throw new Error(
      `locate result coordinates normalizedBy must be positive: ${coordinates.normalizedBy}`,
    );
  }
  const common = {
    order: coordinates.order ?? 'xy',
    normalizedBy: coordinates.normalizedBy,
    normalizationBasis: coordinates.normalizationBasis ?? 'image-size',
    rounding: coordinates.rounding ?? 'round',
  };
  return coordinates.shape === 'bbox'
    ? {
        ...common,
        shape: 'bbox',
        boundsType: coordinates.boundsType ?? 'closed',
      }
    : { ...common, shape: 'point' };
}
