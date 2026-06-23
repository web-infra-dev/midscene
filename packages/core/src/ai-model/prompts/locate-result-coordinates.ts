import type {
  LocateResultBbox,
  LocateResultPromptSpec,
  NonEmptyArray,
} from '../shared/model-locate-result';
import type { ResolvedLocateResultCoordinates } from '../shared/model-locate-result/types';

function describeLocateResultCoordinates({
  shape,
  order,
  normalizedBy,
}: ResolvedLocateResultCoordinates): string {
  const descriptor = shape === 'point' ? 'point' : '2d bounding box';
  const coordinateDescription =
    normalizedBy !== undefined
      ? `normalized to 0-${normalizedBy} relative to the screenshot. Do NOT use pixel coordinates or screenshot width/height`
      : 'in actual pixel coordinates relative to the screenshot';

  if (shape === 'point') {
    const orderDescription = order === 'yx' ? '[y, x]' : '[x, y]';
    return `${descriptor}, should be ${orderDescription} ${coordinateDescription}.`;
  }

  const orderDescription =
    order === 'yx' ? '[ymin, xmin, ymax, xmax]' : '[xmin, ymin, xmax, ymax]';
  return `${descriptor}, should be ${orderDescription} ${coordinateDescription}.`;
}

export function describeLocateResultValueSchema({
  shape,
}: ResolvedLocateResultCoordinates): string {
  return shape === 'point'
    ? '[number, number]'
    : '[number, number, number, number]';
}

export function locateResultExampleValue(
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  region: LocateResultBbox,
): number[] {
  const [left, top, right, bottom] = region;
  if (resolvedCoordinates.shape === 'point') {
    const x = Math.round((left + right) / 2);
    const y = Math.round((top + bottom) / 2);
    return resolvedCoordinates.order === 'yx' ? [y, x] : [x, y];
  }
  return resolvedCoordinates.order === 'yx'
    ? [top, left, bottom, right]
    : region;
}

// Internal xy regions used only for prompt examples.
// Each item is [xmin, ymin, xmax, ymax], before model-specific order mapping.
export const locateResultExampleRegions: LocateResultBbox[] = [
  [100, 100, 200, 200],
  [345, 442, 458, 483],
  [120, 180, 380, 210],
  [120, 240, 380, 270],
  [50, 100, 200, 200],
  [300, 400, 500, 500],
  [600, 100, 800, 250],
  [50, 600, 250, 750],
];

function createExampleValues(
  resolvedCoordinates: ResolvedLocateResultCoordinates,
): NonEmptyArray<unknown> {
  return locateResultExampleRegions.map((region) =>
    locateResultExampleValue(resolvedCoordinates, region),
  ) as NonEmptyArray<unknown>;
}

function locateResultKey({ shape }: ResolvedLocateResultCoordinates): string {
  return shape === 'point' ? 'point' : 'bbox';
}

function locateResultName(
  { shape }: ResolvedLocateResultCoordinates,
  { plural = false }: { plural?: boolean } = {},
): string {
  return shape === 'bbox'
    ? plural
      ? 'bounding boxes'
      : 'bounding box'
    : plural
      ? 'points'
      : 'point';
}

export function createLocateResultPromptSpec(
  resolvedCoordinates: ResolvedLocateResultCoordinates,
): LocateResultPromptSpec {
  return {
    resultKey: locateResultKey(resolvedCoordinates),
    resultValueSchema: describeLocateResultValueSchema(resolvedCoordinates),
    resultValueDescription:
      describeLocateResultCoordinates(resolvedCoordinates),
    resultNoun: locateResultName(resolvedCoordinates),
    resultNounPlural: locateResultName(resolvedCoordinates, { plural: true }),
    exampleValues: createExampleValues(resolvedCoordinates),
  };
}
