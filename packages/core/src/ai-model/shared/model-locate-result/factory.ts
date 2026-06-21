import { createLocateResultPromptSpec } from '../../prompts/locate-result-coordinates';
import { finalizePixelBbox, finalizeSectionLocatePixelBboxGroup } from './bbox';
import { parseNumericLocateResult } from './parse';
import { mapLocateResultToPixelBboxByCoordinates } from './pixel-bbox-mapper';
import type {
  LocateResultAdapter,
  LocateResultAdapterDefinition,
  LocateResultContext,
  LocateResultCoordinates,
  LocateResultValue,
  PixelBbox,
  ResolvedLocateResultCoordinates,
  SectionLocatePixelBboxGroup,
  StandardLocateResultAdapterDefinition,
} from './types';

type RawLocateValuePurpose = 'primary' | 'references';

const rawLocateValueFields = {
  primary: {
    bbox: ['bbox', 'bbox_2d'],
    point: ['point'],
  },
  references: {
    bbox: ['references_bbox', 'references_bbox_2d'],
    point: ['references_point'],
  },
} as const;

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

function extractFirstObjectField(
  input: unknown,
  fields: readonly string[],
): unknown | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const matchedField = fields.find((field) => record[field] !== undefined);
  return matchedField ? record[matchedField] : undefined;
}

function normalizeReferenceResults(input: unknown): unknown[] {
  if (input === undefined || input === null) {
    return [];
  }
  return Array.isArray(input) ? input : [input];
}

function assertValidParsedLocateResult(result: LocateResultValue): void {
  if (!result || typeof result !== 'object') {
    throw new Error(
      `invalid parsed locate result: expected object, got ${JSON.stringify(
        result,
      )}`,
    );
  }

  const expectedLength =
    result.type === 'bbox' ? 4 : result.type === 'point' ? 2 : 0;
  if (!expectedLength) {
    throw new Error(
      `invalid parsed locate result: unsupported type ${JSON.stringify(
        (result as { type?: unknown }).type,
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
      `invalid parsed locate result: ${result.type} coordinates must be ${expectedLength} finite numbers, got ${JSON.stringify(
        coordinates,
      )}`,
    );
  }
}

function pickRawLocateValue(
  input: unknown,
  resolvedCoordinates: ResolvedLocateResultCoordinates,
  purpose: RawLocateValuePurpose,
): unknown | undefined {
  const fields = rawLocateValueFields[purpose][resolvedCoordinates.shape];
  return extractFirstObjectField(input, fields);
}

function extractPrimaryRawLocateValue(
  input: unknown,
  resolvedCoordinates: ResolvedLocateResultCoordinates,
): unknown {
  const pickedRawResult = pickRawLocateValue(
    input,
    resolvedCoordinates,
    'primary',
  );
  if (
    pickedRawResult === undefined &&
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input)
  ) {
    throw new Error(
      'locate response does not contain a recognizable locate result field',
    );
  }

  return pickedRawResult === undefined ? input : pickedRawResult;
}

function extractReferenceRawLocateValues(
  input: unknown,
  resolvedCoordinates: ResolvedLocateResultCoordinates,
): unknown[] {
  return normalizeReferenceResults(
    pickRawLocateValue(input, resolvedCoordinates, 'references'),
  );
}

function createStandardLocateResultAdapterImplementation(
  config: StandardLocateResultAdapterDefinition,
): LocateResultAdapter {
  const resolvedCoordinates = resolveLocateResultCoordinates(
    config.coordinates,
  );
  const parseRawLocateValue =
    config.parseRawLocateValue ??
    ((input) => parseNumericLocateResult(resolvedCoordinates, input));
  const mapLocateResultToPixelBbox =
    config.mapLocateResultToPixelBbox ??
    ((result, ctx) =>
      mapLocateResultToPixelBboxByCoordinates(
        result,
        ctx,
        resolvedCoordinates,
      ));

  const mapRawLocateValueToPixelBbox = (
    rawResult: unknown,
    ctx: LocateResultContext,
  ) => {
    const parsedResult = parseRawLocateValue(rawResult);
    assertValidParsedLocateResult(parsedResult);
    return mapLocateResultToPixelBbox(parsedResult, ctx);
  };
  // Keep error semantics out of the adapter: callers may preserve, ignore, or
  // fail fast on `error` / `errors`, while this layer only extracts coordinates.
  const adaptRawLocateInputToPixelBbox = (
    input: unknown,
    ctx: LocateResultContext,
  ): PixelBbox =>
    mapRawLocateValueToPixelBbox(
      extractPrimaryRawLocateValue(input, resolvedCoordinates),
      ctx,
    );
  const adaptElementLocateResultToPixelBbox = (
    input: unknown,
    ctx: LocateResultContext,
  ): PixelBbox => adaptRawLocateInputToPixelBbox(input, ctx);
  const adaptPlanningParamToPixelBbox = (
    input: unknown,
    ctx: LocateResultContext,
  ): PixelBbox => adaptRawLocateInputToPixelBbox(input, ctx);
  const adaptSectionLocateResultToPixelBboxGroup = (
    input: unknown,
    ctx: LocateResultContext,
  ): SectionLocatePixelBboxGroup => {
    const target = adaptRawLocateInputToPixelBbox(input, ctx);
    const references = extractReferenceRawLocateValues(
      input,
      resolvedCoordinates,
    ).map((raw) => mapRawLocateValueToPixelBbox(raw, ctx));
    return {
      target,
      ...(references.length > 0 ? { references } : {}),
    };
  };
  return {
    promptSpec: createLocateResultPromptSpec(resolvedCoordinates),
    adaptElementLocateResultToPixelBbox,
    adaptSectionLocateResultToPixelBboxGroup,
    adaptPlanningParamToPixelBbox,
  };
}

export function createLocateResultAdapter(
  config: LocateResultAdapterDefinition,
): LocateResultAdapter {
  const adapter: LocateResultAdapter =
    config.kind === 'custom'
      ? config
      : createStandardLocateResultAdapterImplementation(config);

  return {
    promptSpec: adapter.promptSpec,
    adaptElementLocateResultToPixelBbox: (
      input: unknown,
      ctx: LocateResultContext,
    ) =>
      finalizePixelBbox(
        adapter.adaptElementLocateResultToPixelBbox(input, ctx),
        input,
        ctx,
      ),
    adaptSectionLocateResultToPixelBboxGroup: (
      input: unknown,
      ctx: LocateResultContext,
    ) =>
      finalizeSectionLocatePixelBboxGroup(
        adapter.adaptSectionLocateResultToPixelBboxGroup(input, ctx),
        input,
        ctx,
      ),
    adaptPlanningParamToPixelBbox: (input: unknown, ctx: LocateResultContext) =>
      finalizePixelBbox(
        adapter.adaptPlanningParamToPixelBbox(input, ctx),
        input,
        ctx,
      ),
  };
}
