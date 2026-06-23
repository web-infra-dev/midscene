import type {
  LocateResultValue,
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

export function parseNumericLocateResult(
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  input: unknown,
): LocateResultValue {
  if (resolvedCoordinates.shape === 'point') {
    const point = parseCoordinateList(input, 'point');
    if (point.length < 2) {
      throw new Error(`invalid point data: ${JSON.stringify(input)} `);
    }
    return { type: 'point', coordinates: [point[0], point[1]] };
  }

  const bbox = parseCoordinateList(input, 'bbox');
  if (bbox.length !== 4) {
    throw new Error(`invalid bbox data: ${JSON.stringify(input)} `);
  }

  return {
    type: 'bbox',
    coordinates: [bbox[0], bbox[1], bbox[2], bbox[3]],
  };
}
