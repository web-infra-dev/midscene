import type { Rect } from '@/types';
import { isBboxLocateResultValue } from './types';
import type {
  BboxBoundsType,
  BboxLocateResultValue,
  CoordinateRounding,
  LocateResultContext,
  LocateResultPoint,
  LocateResultValue,
  NormalizationBasis,
  PixelBbox,
} from './types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function maxPixelCoordinate(size: number) {
  return Math.max(size - 1, 0);
}

/** Convert units without rounding so intermediate geometry retains precision. */
export function normalizedCoordinateToPixel(
  value: number,
  normalizedBy: number,
  size: number,
  normalizationBasis: NormalizationBasis,
) {
  const scale = (() => {
    switch (normalizationBasis) {
      case 'image-size':
        return size;
      case 'last-pixel':
        return maxPixelCoordinate(size);
      default:
        throw new Error(`Invalid normalization basis: ${normalizationBasis}`);
    }
  })();
  return (value * scale) / normalizedBy;
}

export function roundPixelCoordinate(
  pixel: number,
  rounding: CoordinateRounding,
) {
  switch (rounding) {
    case 'round':
      return Math.round(pixel);
    case 'trunc':
      return Math.trunc(pixel);
    case 'none':
      return pixel;
    default:
      throw new Error(`Invalid coordinate rounding: ${rounding}`);
  }
}

export function roundPixelBbox(
  [left, top, right, bottom]: PixelBbox,
  rounding: CoordinateRounding,
): PixelBbox {
  return [
    roundPixelCoordinate(left, rounding),
    roundPixelCoordinate(top, rounding),
    roundPixelCoordinate(right, rounding),
    roundPixelCoordinate(bottom, rounding),
  ];
}

/** Restrict an already mapped point to the effective content area. */
export function clampPixelPointToSize(
  [x, y]: LocateResultPoint,
  { width, height }: { width: number; height: number },
): LocateResultPoint {
  return [
    clamp(x, 0, maxPixelCoordinate(width)),
    clamp(y, 0, maxPixelCoordinate(height)),
  ];
}

/** Restrict an already mapped bbox to the effective content area. */
export function clampPixelBboxToSize(
  pixelBbox: PixelBbox,
  size: { width: number; height: number },
  boundsType: BboxBoundsType,
): PixelBbox {
  const [left, top, right, bottom] = pixelBbox;
  if (boundsType === 'left-closed-right-open') {
    return [
      clamp(left, 0, size.width),
      clamp(top, 0, size.height),
      clamp(right, 0, size.width),
      clamp(bottom, 0, size.height),
    ];
  }
  return [
    ...clampPixelPointToSize([left, top], size),
    ...clampPixelPointToSize([right, bottom], size),
  ];
}

/**
 * Measure the extent covered by pixel-space endpoints. Closed bounds include
 * the final pixel: [0, 719] and half-open [0, 720) both cover 720 pixels.
 * The +1 measures coverage; it does not rescale or shift either endpoint.
 */
function pixelIntervalLength(
  start: number,
  end: number,
  boundsType: BboxBoundsType,
) {
  return end - start + (boundsType === 'closed' ? 1 : 0);
}

/** Keep a rounded center inside the original interval when it contains integers. */
function pixelIntervalCenter(
  start: number,
  end: number,
  boundsType: BboxBoundsType,
  rounding: CoordinateRounding,
) {
  const center = roundPixelCoordinate(
    start + pixelIntervalLength(start, end, boundsType) / 2,
    rounding,
  );
  if (rounding === 'none') {
    return center;
  }

  const min = Math.ceil(start);
  const max = boundsType === 'closed' ? Math.floor(end) : Math.ceil(end) - 1;
  // No integer can satisfy the interval; retain the configured approximation.
  return min > max ? center : clamp(center, min, max);
}

/**
 * Map axis order and units to an intermediate pixel bbox without rounding or
 * clipping. normalizationBasis selects the pixel scale independently of bbox
 * endpoint inclusion. Used to derive the final click center or rect, not
 * returned as a final locate result. Pixel inputs are not rescaled.
 */
export function mapLocateResultToUnroundedPixelBbox(
  result: BboxLocateResultValue,
  { width, height }: { width: number; height: number },
): PixelBbox {
  const { normalizedBy, order, normalizationBasis } = result.coordinatesMeta;
  const [first, second, third, fourth] = result.coordinates;
  const xyBbox: PixelBbox =
    order === 'yx' ? [second, first, fourth, third] : result.coordinates;
  return normalizedBy === undefined
    ? xyBbox
    : [
        normalizedCoordinateToPixel(
          xyBbox[0],
          normalizedBy,
          width,
          normalizationBasis,
        ),
        normalizedCoordinateToPixel(
          xyBbox[1],
          normalizedBy,
          height,
          normalizationBasis,
        ),
        normalizedCoordinateToPixel(
          xyBbox[2],
          normalizedBy,
          width,
          normalizationBasis,
        ),
        normalizedCoordinateToPixel(
          xyBbox[3],
          normalizedBy,
          height,
          normalizationBasis,
        ),
      ];
}

/** Build region metadata independently from the click center. */
export function mapLocateResultToPixelRect(
  result: BboxLocateResultValue,
  { preparedSize, contentSize = preparedSize }: LocateResultContext,
): Rect {
  const { rounding, boundsType } = result.coordinatesMeta;
  const [left, top, right, bottom] = clampPixelBboxToSize(
    roundPixelBbox(
      mapLocateResultToUnroundedPixelBbox(result, preparedSize),
      rounding,
    ),
    contentSize,
    boundsType,
  );
  return {
    left,
    top,
    width: pixelIntervalLength(left, right, boundsType),
    height: pixelIntervalLength(top, bottom, boundsType),
  };
}

/** Resolve the bounds-aware center before corner rounding or bbox clipping. */
export function mapLocateResultToPixelPoint(
  result: LocateResultValue,
  { width, height }: { width: number; height: number },
): LocateResultPoint {
  const { order, normalizedBy, rounding, normalizationBasis } =
    result.coordinatesMeta;
  if (isBboxLocateResultValue(result)) {
    const [left, top, right, bottom] = mapLocateResultToUnroundedPixelBbox(
      result,
      { width, height },
    );
    const { boundsType } = result.coordinatesMeta;
    return [
      pixelIntervalCenter(left, right, boundsType, rounding),
      pixelIntervalCenter(top, bottom, boundsType, rounding),
    ];
  }

  const [first, second] = result.coordinates;
  const [pointX, pointY] = order === 'yx' ? [second, first] : [first, second];
  const [x, y] =
    normalizedBy === undefined
      ? [pointX, pointY]
      : [
          normalizedCoordinateToPixel(
            pointX,
            normalizedBy,
            width,
            normalizationBasis,
          ),
          normalizedCoordinateToPixel(
            pointY,
            normalizedBy,
            height,
            normalizationBasis,
          ),
        ];
  return [roundPixelCoordinate(x, rounding), roundPixelCoordinate(y, rounding)];
}
