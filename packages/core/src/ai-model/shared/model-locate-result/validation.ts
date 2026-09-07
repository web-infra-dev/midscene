import { isBboxLocateResultValue } from './types';
import type { LocateResultValue } from './types';

export function assertLocateResultStructure(result: LocateResultValue): void {
  if (!result || typeof result !== 'object') {
    throw new Error(
      `invalid parsed locate result: expected object, got ${JSON.stringify(
        result,
      )}`,
    );
  }

  const coordinatesMeta = result.coordinatesMeta;
  const expectedLength =
    coordinatesMeta?.shape === 'bbox'
      ? 4
      : coordinatesMeta?.shape === 'point'
        ? 2
        : 0;
  if (!expectedLength) {
    throw new Error(
      `invalid parsed locate result: unsupported coordinatesMeta.shape ${JSON.stringify(
        coordinatesMeta?.shape,
      )}`,
    );
  }

  const coordinates = result.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== expectedLength ||
    !coordinates.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(
      `invalid parsed locate result: ${coordinatesMeta.shape} coordinates must be ${expectedLength} finite numbers, got ${JSON.stringify(
        coordinates,
      )}`,
    );
  }

  const { order, normalizedBy } = coordinatesMeta;
  if (order !== 'xy' && order !== 'yx') {
    throw new Error(
      `invalid locate coordinate order: ${JSON.stringify(order)}`,
    );
  }
  if (
    normalizedBy !== undefined &&
    (!Number.isFinite(normalizedBy) || normalizedBy <= 0)
  ) {
    throw new Error(
      `locate result normalizedBy must be positive and finite: ${normalizedBy}`,
    );
  }
}

function resolveCoordinateLimits(
  result: LocateResultValue,
  maxX: number,
  maxY: number,
): number[] {
  const resolvedCoordinates = result.coordinatesMeta;
  const normalizedBy = resolvedCoordinates.normalizedBy;
  if (normalizedBy !== undefined) {
    return result.coordinates.map(() => normalizedBy);
  }

  if (resolvedCoordinates.shape === 'bbox') {
    return resolvedCoordinates.order === 'yx'
      ? [maxY, maxX, maxY, maxX]
      : [maxX, maxY, maxX, maxY];
  }

  return resolvedCoordinates.order === 'yx' ? [maxY, maxX] : [maxX, maxY];
}

export function assertLocateResultCoordinateRangeAndOrder(
  result: LocateResultValue,
  maxX: number,
  maxY: number,
) {
  const coordinatesMeta = result.coordinatesMeta;
  const { normalizedBy } = coordinatesMeta;
  const limits = resolveCoordinateLimits(result, maxX, maxY);
  const outOfRange = result.coordinates.some(
    (value, index) => value < 0 || value > limits[index],
  );

  if (outOfRange) {
    const source =
      normalizedBy !== undefined
        ? `normalized range [0, ${normalizedBy}]`
        : `image size [0, ${maxX}]x[0, ${maxY}]`;
    const normalizedInfo =
      normalizedBy !== undefined ? ` normalizedBy=${normalizedBy}` : '';
    throw new Error(
      `locate result coordinates ${JSON.stringify(
        result.coordinates,
      )} exceed ${source}. shape=${
        coordinatesMeta.shape
      } order=${coordinatesMeta.order}${normalizedInfo} limits=${JSON.stringify(
        limits,
      )}`,
    );
  }

  if (
    isBboxLocateResultValue(result) &&
    (result.coordinates[2] < result.coordinates[0] ||
      result.coordinates[3] < result.coordinates[1])
  ) {
    throw new Error(
      `invalid locate bbox coordinate order: ${JSON.stringify(result.coordinates)}`,
    );
  }
}
