import type { TModelFamily } from '@midscene/shared/env';
import { getStandardLocateResultAdapter } from '../../models';
import type { Bbox } from './types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface LocateResultToPixelBboxContext {
  width: number;
  height: number;
  modelFamily?: TModelFamily;
  bounds?: {
    width: number;
    height: number;
  };
}

export function adaptLocateResultToPixelBbox(
  rawResult: unknown,
  context: LocateResultToPixelBboxContext,
): Bbox {
  const { width, height, modelFamily, bounds } = context;
  const rightLimit = bounds?.width ?? width;
  const bottomLimit = bounds?.height ?? height;

  const resultAdapter = getStandardLocateResultAdapter(modelFamily);
  const [left, top, right, bottom] = resultAdapter.normalizeResultToPixelBbox(
    resultAdapter.resolveLocateResult(rawResult),
    { width, height },
  );

  return [
    clamp(left, 0, rightLimit),
    clamp(top, 0, bottomLimit),
    clamp(right, 0, rightLimit),
    clamp(bottom, 0, bottomLimit),
  ];
}
