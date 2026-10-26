import { parseNumericLocateResult } from './parse';
import {
  clampPixelBboxToSize,
  clampPixelPointToSize,
  mapLocateResultToPixelBbox,
  mapLocateResultToPixelPoint,
  pixelBboxToRect,
} from './pixel-mapper';
import { createLocateResultPromptSpec } from './prompt-spec';
import { isBboxLocateResultValue } from './types';
import type {
  LocateResultCodec,
  LocateResultCoordinates,
  LocateResultFormatDefinition,
  ResolvedLocateResultCoordinates,
} from './types';
import {
  assertLocateResultCoordinateRangeAndOrder,
  assertLocateResultStructure,
} from './validation';

export function resolveLocateResultCoordinates(
  coordinates: LocateResultCoordinates,
): ResolvedLocateResultCoordinates {
  if (coordinates.normalizedBy !== undefined && coordinates.normalizedBy <= 0) {
    throw new Error(
      `locate result coordinates normalizedBy must be positive: ${coordinates.normalizedBy}`,
    );
  }
  return {
    ...(coordinates.shape === 'bbox'
      ? { boundsType: coordinates.boundsType ?? 'inclusive' }
      : {}),
    shape: coordinates.shape,
    order: coordinates.order ?? 'xy',
    normalizedBy: coordinates.normalizedBy,
    rounding: coordinates.rounding ?? 'round',
  };
}

export function createLocateResultCodec(
  config: LocateResultFormatDefinition,
): LocateResultCodec {
  const resolvedCoordinates = resolveLocateResultCoordinates(
    config.coordinates,
  );
  const parseRawLocateValue =
    config.parseRawLocateValue ??
    ((input) => parseNumericLocateResult(resolvedCoordinates, input));
  return {
    promptSpec: createLocateResultPromptSpec(resolvedCoordinates, {
      resultKey: config.resultKey,
      resultKeyAliases: config.resultKeyAliases,
    }),
    toPixelResult: (rawResult, context) => {
      const result = parseRawLocateValue(rawResult);
      const { preparedSize, contentSize = preparedSize } = context;
      assertLocateResultStructure(result);
      const edgeBounds =
        isBboxLocateResultValue(result) &&
        result.coordinatesMeta.boundsType === 'edges';
      assertLocateResultCoordinateRangeAndOrder(
        result,
        preparedSize.width - (edgeBounds ? 0 : 1),
        preparedSize.height - (edgeBounds ? 0 : 1),
      );
      // Clamp the mapped center independently from the optional bbox so padding
      // removal cannot change the target by recomputing a clipped box's center.
      const center = clampPixelPointToSize(
        mapLocateResultToPixelPoint(result, preparedSize),
        contentSize,
      );
      // Preserve an original bbox as region metadata for DeepLocate search areas
      // and aiLocate's return value. Point-only results leave rect undefined;
      // click coordinates always use the independently calculated center.
      const rect = isBboxLocateResultValue(result)
        ? (() => {
            const pixelBbox = clampPixelBboxToSize(
              mapLocateResultToPixelBbox(result, preparedSize),
              contentSize,
              result.coordinatesMeta.boundsType,
            );
            return pixelBboxToRect(
              pixelBbox,
              result.coordinatesMeta.boundsType,
            );
          })()
        : undefined;
      return { center, rect };
    },
  };
}
