import type { Bbox } from './types';

type AdaptBboxInput = number[] | string[] | string | (number[] | string[])[];

const defaultBboxSize = 20; // must be even number

export function unwrapBboxLikeInput(
  bbox: AdaptBboxInput,
): number[] | string[] | string {
  if (Array.isArray(bbox)) {
    if (Array.isArray(bbox[0])) {
      return bbox[0] as number[] | string[];
    }
    return bbox as number[] | string[];
  }
  return bbox as string;
}

export function mapNormalized01000XyxyToActualPixelBbox(
  bbox: number[],
  width: number,
  height: number,
): Bbox {
  return [
    Math.round((bbox[0] * width) / 1000),
    Math.round((bbox[1] * height) / 1000),
    Math.round((bbox[2] * width) / 1000),
    Math.round((bbox[3] * height) / 1000),
  ];
}

export function mapNormalized01000YxyxToActualPixelBbox(
  bbox: number[],
  width: number,
  height: number,
): Bbox {
  const left = Math.round((bbox[1] * width) / 1000);
  const top = Math.round((bbox[0] * height) / 1000);
  const right = Math.round((bbox[3] * width) / 1000);
  const bottom = Math.round((bbox[2] * height) / 1000);
  return [left, top, right, bottom];
}

/**
 * Expand a point in normalized 0-1000 coordinates to a small bbox in the same
 * coordinate system.
 */
export function expandNormalized01000PointToBbox(
  x: number,
  y: number,
  bboxSize = defaultBboxSize,
): Bbox {
  const halfSize = bboxSize / 2;
  const x1 = Math.max(x - halfSize, 0);
  const y1 = Math.max(y - halfSize, 0);
  const x2 = Math.min(x + halfSize, 1000);
  const y2 = Math.min(y + halfSize, 1000);

  return [x1, y1, x2, y2];
}

export function expandActualPixelPointToBbox(
  x: number,
  y: number,
  width: number,
  height: number,
  bboxSize = defaultBboxSize,
): Bbox {
  const halfSize = bboxSize / 2;
  return [
    Math.max(0, x - halfSize),
    Math.max(0, y - halfSize),
    Math.min(width, x + halfSize),
    Math.min(height, y + halfSize),
  ];
}
