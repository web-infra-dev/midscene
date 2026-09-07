import type { Rect } from '@/types';
import { isBboxLocateResultValue } from './types';
import type {
  BboxLocateResultValue,
  LocateResultPoint,
  LocateResultValue,
  PixelBbox,
} from './types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function maxPixelCoordinate(size: number) {
  return Math.max(size - 1, 0);
}

export function normalizedCoordinateToPixel(
  value: number,
  normalizedBy: number,
  size: number,
) {
  return Math.round((value * maxPixelCoordinate(size)) / normalizedBy);
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
): PixelBbox {
  const [left, top, right, bottom] = pixelBbox;
  return [
    ...clampPixelPointToSize([left, top], size),
    ...clampPixelPointToSize([right, bottom], size),
  ];
}

export function pixelBboxToRect([left, top, right, bottom]: PixelBbox): Rect {
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function mapLocateResultToPixelBbox(
  result: BboxLocateResultValue,
  { width, height }: { width: number; height: number },
): PixelBbox {
  const { normalizedBy, order } = result.coordinatesMeta;
  const [first, second, third, fourth] = result.coordinates;
  const xyBbox: PixelBbox =
    order === 'yx' ? [second, first, fourth, third] : result.coordinates;
  return normalizedBy === undefined
    ? xyBbox
    : [
        normalizedCoordinateToPixel(xyBbox[0], normalizedBy, width),
        normalizedCoordinateToPixel(xyBbox[1], normalizedBy, height),
        normalizedCoordinateToPixel(xyBbox[2], normalizedBy, width),
        normalizedCoordinateToPixel(xyBbox[3], normalizedBy, height),
      ];
}

/** Resolve the target before any rounding or clipping can shift its center. */
export function mapLocateResultToPixelPoint(
  result: LocateResultValue,
  { width, height }: { width: number; height: number },
): LocateResultPoint {
  const { order, normalizedBy } = result.coordinatesMeta;
  const [first, second] = isBboxLocateResultValue(result)
    ? [
        (result.coordinates[0] + result.coordinates[2]) / 2,
        (result.coordinates[1] + result.coordinates[3]) / 2,
      ]
    : result.coordinates;
  const [x, y] = order === 'yx' ? [second, first] : [first, second];
  return normalizedBy === undefined
    ? [x, y]
    : [
        normalizedCoordinateToPixel(x, normalizedBy, width),
        normalizedCoordinateToPixel(y, normalizedBy, height),
      ];
}
