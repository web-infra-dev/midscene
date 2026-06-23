import {
  expandPointToBbox,
  mapNormalizedCoordinatesToPixelBbox,
  maxPixelIndex,
} from './bbox';
import type {
  LocateResultBbox,
  LocateResultValue,
  PixelBbox,
  ResolvedLocateResultCoordinates,
} from './types';

type Point = [number, number];

const defaultBboxSize = 20; // must be even number

function resolveCoordinateLimits(
  result: LocateResultValue,
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  width: number,
  height: number,
): number[] {
  const normalizedBy = resolvedCoordinates.normalizedBy;
  if (normalizedBy !== undefined) {
    return result.coordinates.map(() => normalizedBy);
  }

  if (result.type === 'bbox') {
    return resolvedCoordinates.order === 'yx'
      ? [height, width, height, width]
      : [width, height, width, height];
  }

  return resolvedCoordinates.order === 'yx' ? [height, width] : [width, height];
}

function assertLocateResultCoordinates(
  result: LocateResultValue,
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  width: number,
  height: number,
) {
  const normalizedBy = resolvedCoordinates.normalizedBy;
  const limits = resolveCoordinateLimits(
    result,
    resolvedCoordinates,
    width,
    height,
  );
  const outOfRange = result.coordinates.some((value, index) => {
    const limit = limits[index];
    return (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > limit
    );
  });

  if (!outOfRange) {
    return;
  }

  const source =
    normalizedBy !== undefined
      ? `normalized range [0, ${normalizedBy}]`
      : `image size [0, ${width}]x[0, ${height}]`;
  const normalizedInfo =
    normalizedBy !== undefined ? ` normalizedBy=${normalizedBy}` : '';
  throw new Error(
    `locate result coordinates ${JSON.stringify(
      result.coordinates,
    )} exceed ${source}. shape=${
      resolvedCoordinates.shape
    } order=${resolvedCoordinates.order}${normalizedInfo} limits=${JSON.stringify(
      limits,
    )}`,
  );
}

function reorderCoordinatesToXy(
  coordinates: LocateResultBbox,
  order: ResolvedLocateResultCoordinates['order'],
): LocateResultBbox;
function reorderCoordinatesToXy(
  coordinates: Point,
  order: ResolvedLocateResultCoordinates['order'],
): Point;
function reorderCoordinatesToXy(
  coordinates: LocateResultBbox | Point,
  order: ResolvedLocateResultCoordinates['order'],
): LocateResultBbox | Point;
function reorderCoordinatesToXy(
  coordinates: LocateResultBbox | Point,
  order: ResolvedLocateResultCoordinates['order'],
): LocateResultBbox | Point {
  if (order !== 'yx') {
    return coordinates;
  }

  if (coordinates.length === 4) {
    const [top, left, bottom, right] = coordinates;
    return [left, top, right, bottom];
  }

  const [y, x] = coordinates;
  return [x, y];
}

export function mapLocateResultToPixelBboxByCoordinates(
  result: LocateResultValue,
  { preparedSize }: { preparedSize: { width: number; height: number } },
  resolvedCoordinates: ResolvedLocateResultCoordinates,
): PixelBbox {
  // The parsed result type decides whether this maps a bbox or expands a point.
  // `resolvedCoordinates` describes coordinate order and normalization only.
  const { width, height } = preparedSize;
  const normalizedBy = resolvedCoordinates.normalizedBy;
  assertLocateResultCoordinates(result, resolvedCoordinates, width, height);

  const xyCoordinates = reorderCoordinatesToXy(
    result.coordinates,
    resolvedCoordinates.order,
  );

  const xyBbox =
    xyCoordinates.length === 4
      ? xyCoordinates
      : expandPointToBbox(
          xyCoordinates[0],
          xyCoordinates[1],
          normalizedBy ?? maxPixelIndex(width),
          normalizedBy ?? maxPixelIndex(height),
          normalizedBy === undefined ? defaultBboxSize / 2 : normalizedBy / 100,
        );

  return normalizedBy === undefined
    ? xyBbox
    : mapNormalizedCoordinatesToPixelBbox(xyBbox, normalizedBy, width, height);
}
