import { finalizePixelBbox } from './bbox';
import { parseNumericLocateResult } from './parse';
import { mapLocateResultToPixelBboxByCoordinates } from './pixel-bbox-mapper';
import { createLocateResultPromptSpec } from './prompt-spec';
import type {
  LocateResultCodec,
  LocateResultContext,
  LocateResultCoordinates,
  LocateResultFormatDefinition,
  LocateResultValue,
  ResolvedLocateResultCoordinates,
} from './types';

export function resolveLocateResultCoordinates(
  coordinates: LocateResultCoordinates,
): ResolvedLocateResultCoordinates {
  const order = coordinates.order ?? 'xy';
  if (coordinates.normalizedBy !== undefined && coordinates.normalizedBy <= 0) {
    throw new Error(
      `locate result coordinates normalizedBy must be positive: ${coordinates.normalizedBy}`,
    );
  }
  return {
    shape: coordinates.shape,
    order,
    normalizedBy: coordinates.normalizedBy,
  };
}

function assertValidParsedLocateResult(result: LocateResultValue): void {
  if (!result || typeof result !== 'object') {
    throw new Error(
      `invalid parsed locate result: expected object, got ${JSON.stringify(
        result,
      )}`,
    );
  }

  const coordinatesMeta = result.coordinatesMeta;
  const expectedLength =
    coordinatesMeta?.shape === 'bbox'
      ? 4
      : coordinatesMeta?.shape === 'point'
        ? 2
        : 0;
  if (!expectedLength) {
    throw new Error(
      `invalid parsed locate result: unsupported coordinatesMeta.shape ${JSON.stringify(
        coordinatesMeta?.shape,
      )}`,
    );
  }

  const coordinates = result.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== expectedLength ||
    !coordinates.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(
      `invalid parsed locate result: ${coordinatesMeta.shape} coordinates must be ${expectedLength} finite numbers, got ${JSON.stringify(
        coordinates,
      )}`,
    );
  }
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
  const mapLocateResultToPixelBbox =
    config.mapLocateResultToPixelBbox ??
    ((result, ctx) => mapLocateResultToPixelBboxByCoordinates(result, ctx));

  const toPixelBbox = (rawResult: unknown, context: LocateResultContext) => {
    const parsedResult = parseRawLocateValue(rawResult);
    assertValidParsedLocateResult(parsedResult);
    const pixelBbox = mapLocateResultToPixelBbox(parsedResult, context);
    return finalizePixelBbox(pixelBbox, rawResult, context);
  };

  return {
    promptSpec: createLocateResultPromptSpec(resolvedCoordinates),
    toPixelBbox,
  };
}
