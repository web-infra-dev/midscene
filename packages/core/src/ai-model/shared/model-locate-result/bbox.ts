import type {
  LocateResultBbox,
  LocateResultContext,
  PixelBbox,
  SectionLocatePixelBboxGroup,
} from './types';

export function maxPixelIndex(size: number) {
  return Math.max(size - 1, 0);
}

export function normalizedCoordinateToPixelIndex(
  value: number,
  normalizedBy: number,
  size: number,
) {
  return Math.round((value * maxPixelIndex(size)) / normalizedBy);
}

export function mapNormalizedCoordinatesToPixelBbox(
  coordinates: LocateResultBbox,
  normalizedBy: number,
  width: number,
  height: number,
): PixelBbox {
  // PixelBbox uses inclusive pixel indexes, so normalized coordinates map to
  // size - 1.
  const [left, top, right, bottom] = coordinates;
  return [
    normalizedCoordinateToPixelIndex(left, normalizedBy, width),
    normalizedCoordinateToPixelIndex(top, normalizedBy, height),
    normalizedCoordinateToPixelIndex(right, normalizedBy, width),
    normalizedCoordinateToPixelIndex(bottom, normalizedBy, height),
  ];
}

export function expandPointToBbox(
  x: number,
  y: number,
  maxX: number,
  maxY: number,
  halfSize: number,
): LocateResultBbox {
  return [
    Math.max(0, x - halfSize),
    Math.max(0, y - halfSize),
    Math.min(maxX, x + halfSize),
    Math.min(maxY, y + halfSize),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function assertFinitePixelBbox(
  pixelBbox: readonly number[],
  rawResult: unknown,
): asserts pixelBbox is PixelBbox {
  if (
    pixelBbox.length !== 4 ||
    !pixelBbox.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(`invalid locate bbox data: ${JSON.stringify(rawResult)} `);
  }
}

function assertPixelBboxOrder(pixelBbox: PixelBbox, rawResult: unknown) {
  const [left, top, right, bottom] = pixelBbox;
  if (right >= left && bottom >= top) {
    return;
  }

  throw new Error(
    `locate pixel bbox has invalid coordinate order: bbox=${JSON.stringify(
      rawResult,
    )} pixelBbox=${JSON.stringify(pixelBbox)}`,
  );
}

function assertPixelBboxInsideImage(
  pixelBbox: PixelBbox,
  rawResult: unknown,
  width: number,
  height: number,
) {
  const [left, top, right, bottom] = pixelBbox;
  const maxRight = maxPixelIndex(width);
  const maxBottom = maxPixelIndex(height);
  const outOfImage =
    left < 0 || top < 0 || right > maxRight || bottom > maxBottom;

  if (!outOfImage) {
    return;
  }

  throw new Error(
    `locate pixel bbox is outside the image size: bbox=${JSON.stringify(
      rawResult,
    )} imageSize=${width}x${height}`,
  );
}

export function finalizePixelBbox(
  pixelBbox: PixelBbox,
  rawResult: unknown,
  { preparedSize, contentSize }: LocateResultContext,
): PixelBbox {
  const { width, height } = preparedSize;
  assertFinitePixelBbox(pixelBbox, rawResult);
  assertPixelBboxOrder(pixelBbox, rawResult);
  assertPixelBboxInsideImage(pixelBbox, rawResult, width, height);

  const rightLimit = maxPixelIndex(contentSize?.width ?? width);
  const bottomLimit = maxPixelIndex(contentSize?.height ?? height);
  const [left, top, right, bottom] = pixelBbox;

  return [
    clamp(left, 0, rightLimit),
    clamp(top, 0, bottomLimit),
    clamp(right, 0, rightLimit),
    clamp(bottom, 0, bottomLimit),
  ];
}

export function finalizeSectionLocatePixelBboxGroup(
  result: SectionLocatePixelBboxGroup,
  rawResult: unknown,
  ctx: LocateResultContext,
): SectionLocatePixelBboxGroup {
  return {
    target: finalizePixelBbox(result.target, rawResult, ctx),
    ...(result.references
      ? {
          references: result.references.map((reference) =>
            finalizePixelBbox(reference, rawResult, ctx),
          ),
        }
      : {}),
  };
}
