import { resolveLocateResultCoordinates } from './coordinates';
import { createLocateResultValue, parseNumericLocateResult } from './parse';
import {
  clampPixelPointToSize,
  mapLocateResultToPixelPoint,
  mapLocateResultToPixelRect,
} from './pixel-mapper';
import { createLocateResultPromptSpec } from './prompt-spec';
import { isBboxLocateResultValue } from './types';
import type { LocateResultCodec, LocateResultFormatDefinition } from './types';
import {
  assertLocateResultCoordinateRangeAndOrder,
  assertLocateResultStructure,
} from './validation';

export { resolveLocateResultCoordinates } from './coordinates';

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
      const parsed = parseRawLocateValue(rawResult);
      assertLocateResultStructure(parsed);
      const result = createLocateResultValue(
        parsed.coordinatesMeta,
        parsed.coordinates,
      );
      const { preparedSize, contentSize = preparedSize } = context;
      const leftClosedRightOpenBounds =
        isBboxLocateResultValue(result) &&
        result.coordinatesMeta.boundsType === 'left-closed-right-open';
      assertLocateResultCoordinateRangeAndOrder(
        result,
        preparedSize.width - (leftClosedRightOpenBounds ? 0 : 1),
        preparedSize.height - (leftClosedRightOpenBounds ? 0 : 1),
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
        ? mapLocateResultToPixelRect(result, context)
        : undefined;
      return { center, rect };
    },
  };
}
