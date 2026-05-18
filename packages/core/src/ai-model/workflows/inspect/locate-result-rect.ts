import { adaptLocateResultToPixelBbox } from '@/ai-model/shared/model-locate-result/adapt';
import type { Rect } from '@/types';
import type { TModelFamily } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { SearchAreaImageMapping } from './types';

const debugInspectUtils = getDebug('ai:common');

interface ModelLocateResultToRectContext {
  width: number;
  height: number;
  modelFamily?: TModelFamily;
  bounds?: {
    width: number;
    height: number;
  };
  mapping?: SearchAreaImageMapping;
}

export function adaptModelLocateResultToRect(
  rawResult: unknown,
  context: ModelLocateResultToRectContext,
): Rect {
  const { width, height, modelFamily, bounds, mapping } = context;
  const offset = mapping?.offset ?? { x: 0, y: 0 };
  const scale = mapping?.scale ?? 1;

  debugInspectUtils(
    'adaptModelLocateResultToRect',
    rawResult,
    width,
    height,
    'offset',
    offset.x,
    offset.y,
    'limit',
    bounds?.width ?? width,
    bounds?.height ?? height,
    'modelFamily',
    modelFamily,
    'scale',
    scale,
  );

  const [rectLeft, rectTop, boundedRight, boundedBottom] =
    adaptLocateResultToPixelBbox(rawResult, {
      width,
      height,
      bounds,
      modelFamily,
    });

  const rectWidth = boundedRight - rectLeft + 1;
  const rectHeight = boundedBottom - rectTop + 1;

  const finalLeft = scale !== 1 ? Math.round(rectLeft / scale) : rectLeft;
  const finalTop = scale !== 1 ? Math.round(rectTop / scale) : rectTop;
  const finalWidth = scale !== 1 ? Math.round(rectWidth / scale) : rectWidth;
  const finalHeight = scale !== 1 ? Math.round(rectHeight / scale) : rectHeight;

  const rect = {
    left: finalLeft + offset.x,
    top: finalTop + offset.y,
    width: finalWidth,
    height: finalHeight,
  };
  debugInspectUtils('adaptModelLocateResultToRect, result=', rect);

  return rect;
}
