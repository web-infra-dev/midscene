import type { LocateResultResponseFormat } from '../shared/model-locate-result';

export function describeLocateResultResponseFormat({
  resultType,
  coordinateSystem,
  coordinateOrder,
  locateResultFormatDescriptor,
}: LocateResultResponseFormat): string {
  const descriptor =
    locateResultFormatDescriptor ||
    (resultType === 'point' ? 'point' : '2d bounding box');
  const coordinateDescription =
    coordinateSystem === 'normalized-0-1000'
      ? 'normalized to 0-1000'
      : 'in actual pixel coordinates';

  if (resultType === 'point') {
    return `${descriptor}, should be [x, y] ${coordinateDescription}.`;
  }

  const orderDescription =
    coordinateOrder === 'yxyx'
      ? '[ymin, xmin, ymax, xmax]'
      : '[xmin, ymin, xmax, ymax]';
  return `${descriptor}, should be ${orderDescription} ${coordinateDescription}.`;
}

export function describeLocateResultValueSchema({
  resultType,
}: LocateResultResponseFormat): string {
  return resultType === 'point'
    ? '[number, number]'
    : '[number, number, number, number]';
}

export function locateResultExampleValue(
  responseFormat: LocateResultResponseFormat,
  numbers: [number, number, number, number] = [100, 100, 200, 200],
): number[] {
  return responseFormat.resultType === 'point'
    ? [numbers[0], numbers[1]]
    : numbers;
}

export function formatLocateResultValue(value: number[]): string {
  return `[${value.join(', ')}]`;
}

export function describeLocateResultJsonProperty(
  responseFormat: LocateResultResponseFormat,
): string {
  const key = responseFormat.resultType;
  return `"${key}": ${describeLocateResultValueSchema(responseFormat)},  // ${describeLocateResultResponseFormat(responseFormat)}`;
}

function locateResultName(
  { resultType }: LocateResultResponseFormat,
  { plural = false }: { plural?: boolean } = {},
): string {
  return resultType === 'bbox'
    ? plural
      ? 'bounding boxes'
      : 'bounding box'
    : plural
      ? 'points'
      : 'point';
}

export function describeLocateResultField(
  responseFormat: LocateResultResponseFormat,
  subjectDescription: string,
  { plural = false }: { plural?: boolean } = {},
): string {
  return `${locateResultName(responseFormat, {
    plural,
  })} of ${subjectDescription}`;
}

export function describeLocateParamSchema(
  responseFormat: LocateResultResponseFormat,
): string {
  const resultKey = responseFormat.resultType;
  return `{${resultKey}: ${describeLocateResultValueSchema(responseFormat)}, prompt: string } // ${describeLocateResultResponseFormat(responseFormat)}`;
}

export function locateResultExampleJsonEntry(
  responseFormat: LocateResultResponseFormat,
  bbox?: [number, number, number, number],
): string {
  return `"${responseFormat.resultType}": ${formatLocateResultValue(
    locateResultExampleValue(responseFormat, bbox),
  )}`;
}
