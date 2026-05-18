import { assert } from '@midscene/shared/utils';
import { resolveLocateResultResponseFormat } from './format';
import {
  expandActualPixelPointToBbox,
  expandNormalized01000PointToBbox,
  mapNormalized01000XyxyToActualPixelBbox,
  mapNormalized01000YxyxToActualPixelBbox,
  unwrapBboxLikeInput,
} from './normalize';
import type {
  Bbox,
  LocateResultAdapter,
  LocateResultAdapterDefinition,
  LocateResultExtractorPreset,
  LocateResultFormatPreset,
  LocateResultResponseFormat,
  LocateResultValue,
} from './types';

type AdaptBboxInput = number[] | string[] | string | (number[] | string[])[];

function extractBboxWithBbox2dFallback(input: unknown): unknown | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const locate = input as { bbox?: unknown; bbox_2d?: unknown };
  return locate.bbox ?? locate.bbox_2d;
}

function extractPoint(input: unknown): unknown | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  return (input as { point?: unknown }).point;
}

function resolveNumericLocateResult(
  format: LocateResultFormatPreset,
  input: unknown,
): LocateResultValue {
  if (format.startsWith('point-')) {
    const point = unwrapBboxLikeInput(input as AdaptBboxInput) as number[];
    if (point.length < 2) {
      throw new Error(`invalid point data: ${JSON.stringify(input)} `);
    }
    return { type: 'point', coordinates: [point[0], point[1]] };
  }

  return {
    type: 'bbox',
    coordinates: unwrapBboxLikeInput(input as AdaptBboxInput) as Bbox,
  };
}

function resolveRawResultExtractor(
  extractor: LocateResultExtractorPreset | undefined,
  responseFormat: LocateResultResponseFormat,
) {
  if (!extractor) {
    return responseFormat.resultType === 'point'
      ? extractPoint
      : extractBboxWithBbox2dFallback;
  }

  if (extractor === 'bbox-or-bbox_2d') {
    return extractBboxWithBbox2dFallback;
  }

  throw new Error(`Unknown locate result extractor: ${extractor}`);
}

function resolveNormalizer(responseFormat: LocateResultResponseFormat) {
  return (
    result: LocateResultValue,
    { width, height }: { width: number; height: number },
  ): Bbox => {
    if (result.type === 'bbox') {
      if (responseFormat.coordinateSystem === 'actual-pixel') {
        return result.coordinates;
      }
      if (responseFormat.coordinateOrder === 'yxyx') {
        return mapNormalized01000YxyxToActualPixelBbox(
          result.coordinates,
          width,
          height,
        );
      }
      return mapNormalized01000XyxyToActualPixelBbox(
        result.coordinates,
        width,
        height,
      );
    }

    assert(
      responseFormat.resultType === 'point',
      'numeric locate result must be bbox',
    );
    if (responseFormat.coordinateSystem === 'actual-pixel') {
      return expandActualPixelPointToBbox(
        result.coordinates[0],
        result.coordinates[1],
        width,
        height,
      );
    }

    return mapNormalized01000XyxyToActualPixelBbox(
      expandNormalized01000PointToBbox(
        result.coordinates[0],
        result.coordinates[1],
      ),
      width,
      height,
    );
  };
}

function resolveExtractor(
  config: LocateResultAdapterDefinition,
  responseFormat: LocateResultResponseFormat,
) {
  if (typeof config.extract === 'function') {
    return config.extract;
  }
  return resolveRawResultExtractor(config.extract, responseFormat);
}

export function createLocateResultAdapter(
  config: LocateResultAdapterDefinition,
): LocateResultAdapter {
  const responseFormat = resolveLocateResultResponseFormat(
    config.format,
    config.locateResultFormatDescriptor,
  );
  return {
    responseFormat,
    extractRawLocateResult: resolveExtractor(config, responseFormat),
    resolveLocateResult:
      config.resolve ??
      ((input) => resolveNumericLocateResult(config.format, input)),
    normalizeResultToPixelBbox:
      config.normalize ?? resolveNormalizer(responseFormat),
  };
}
