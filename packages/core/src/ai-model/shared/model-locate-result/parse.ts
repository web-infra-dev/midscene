import type {
  BboxLocateResultCoordinates,
  BboxLocateResultValue,
  LocateResultBbox,
  LocateResultPoint,
  LocateResultValue,
  PointLocateResultCoordinates,
  PointLocateResultValue,
  ResolvedLocateResultCoordinates,
} from './types';

type CoordinateListLikeInput =
  | number[]
  | string[]
  | string
  | (number[] | string[])[];

export function unwrapCoordinateListLikeInput(
  coordinateList: CoordinateListLikeInput,
): number[] | string[] | string {
  if (Array.isArray(coordinateList)) {
    if (Array.isArray(coordinateList[0])) {
      return coordinateList[0] as number[] | string[];
    }
    return coordinateList as number[] | string[];
  }
  return coordinateList as string;
}

function parseCoordinateList(input: unknown, label: string): number[] {
  const unwrapped = unwrapCoordinateListLikeInput(
    input as CoordinateListLikeInput,
  );
  const values =
    typeof unwrapped === 'string'
      ? unwrapped
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
      : unwrapped;

  if (!Array.isArray(values)) {
    throw new Error(`invalid ${label} data: ${JSON.stringify(input)} `);
  }

  const numericValues = values.map((value) =>
    typeof value === 'number' ? value : Number(value),
  );

  if (!numericValues.every((value) => Number.isFinite(value))) {
    throw new Error(`invalid ${label} data: ${JSON.stringify(input)} `);
  }

  return numericValues;
}

export function createLocateResultValue(
  coordinatesMeta: PointLocateResultCoordinates,
  coordinates: number[],
): PointLocateResultValue;
export function createLocateResultValue(
  coordinatesMeta: BboxLocateResultCoordinates,
  coordinates: number[],
): BboxLocateResultValue;
export function createLocateResultValue(
  coordinatesMeta: ResolvedLocateResultCoordinates,
  coordinates: number[],
): LocateResultValue {
  if (coordinatesMeta.shape === 'point') {
    return {
      coordinates: [coordinates[0], coordinates[1]] as LocateResultPoint,
      coordinatesMeta,
    };
  }

  return {
    coordinates: [
      coordinates[0],
      coordinates[1],
      coordinates[2],
      coordinates[3],
    ] as LocateResultBbox,
    coordinatesMeta,
  };
}

export function parseNumericLocateResult(
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  input: unknown,
): LocateResultValue {
  if (resolvedCoordinates.shape === 'point') {
    const point = parseCoordinateList(input, 'point');
    if (point.length < 2) {
      throw new Error(`invalid point data: ${JSON.stringify(input)} `);
    }
    return createLocateResultValue(resolvedCoordinates, point);
  }

  const bbox = parseCoordinateList(input, 'bbox');
  if (bbox.length !== 4) {
    throw new Error(`invalid bbox data: ${JSON.stringify(input)} `);
  }

  return createLocateResultValue(resolvedCoordinates, bbox);
}
