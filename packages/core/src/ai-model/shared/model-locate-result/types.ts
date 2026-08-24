import type { Bbox } from '../../../types';

export type { Bbox };
export type LocateResultBbox = Bbox;
export type PixelBbox = Bbox;
export type NonEmptyArray<T> = [T, ...T[]];
export type RawLocateValue = unknown;

export type LocateResultPoint = [number, number];
export type PointLocateResultCoordinates = ResolvedLocateResultCoordinates & {
  shape: 'point';
};
export type BboxLocateResultCoordinates = ResolvedLocateResultCoordinates & {
  shape: 'bbox';
};

export type LocateResultValue =
  | {
      coordinates: LocateResultPoint;
      coordinatesMeta: PointLocateResultCoordinates;
    }
  | {
      coordinates: LocateResultBbox;
      coordinatesMeta: BboxLocateResultCoordinates;
    };

export type PointLocateResultValue = Extract<
  LocateResultValue,
  { coordinatesMeta: { shape: 'point' } }
>;
export type BboxLocateResultValue = Extract<
  LocateResultValue,
  { coordinatesMeta: { shape: 'bbox' } }
>;

export function isBboxLocateResultValue(
  result: LocateResultValue,
): result is BboxLocateResultValue {
  return result.coordinatesMeta.shape === 'bbox';
}

export function isPointLocateResultValue(
  result: LocateResultValue,
): result is PointLocateResultValue {
  return result.coordinatesMeta.shape === 'point';
}

export type LocateResultShape = 'bbox' | 'point';

export interface LocateResultContext {
  preparedSize: {
    width: number;
    height: number;
  };
  contentSize?: {
    width: number;
    height: number;
  };
}

export interface LocateResultPromptSpec {
  resultKey: string;
  resultValueSchema: string;
  resultValueDescription: string;
  resultNoun: string;
  resultNounPlural: string;
  exampleValues: NonEmptyArray<unknown>;
}

export interface LocateResultCodec {
  promptSpec: LocateResultPromptSpec;
  toPixelBbox(input: RawLocateValue, ctx: LocateResultContext): PixelBbox;
}

export interface LocateResultCoordinates {
  shape: LocateResultShape;
  order?: 'xy' | 'yx';
  normalizedBy?: number;
}

export type ResolvedLocateResultCoordinates =
  | {
      shape: 'point';
      order: 'xy' | 'yx';
      normalizedBy?: number;
    }
  | {
      shape: 'bbox';
      order: 'xy' | 'yx';
      normalizedBy?: number;
    };

export type RawLocateValueParser = (input: RawLocateValue) => LocateResultValue;
export type LocateResultPixelBboxMapper = (
  result: LocateResultValue,
  ctx: LocateResultContext,
) => PixelBbox;

/**
 * Declarative config for the standard locate workflow.
 *
 * The standard workflow has three steps:
 * 1. `coordinates` is expanded into prompt wording, a default
 *    raw result parser, and a default pixel bbox mapper.
 * 2. `parseRawLocateValue` converts that raw result value into Midscene's
 *    internal `LocateResultValue` shape:
 *    `{ coordinates, coordinatesMeta }`. Omit it when the model returns a
 *    plain numeric bbox/point matching `coordinates`; provide it when the
 *    model needs repair, fallback handling, or per-result coordinate metadata.
 * 3. `mapLocateResultToPixelBbox` converts the parsed result into a pixel bbox
 *    `[left, top, right, bottom]`. Omit it when `coordinates` is enough to describe
 *    the coordinate system and order; provide it only for model-specific
 *    conversion rules.
 *
 * This format only describes one raw coordinate value. The operation protocol
 * owns the response envelope and identifies target/reference values before the
 * runtime codec converts each value independently.
 *
 * Example 1: a GLM-like model that directly matches the standard coordinates.
 *
 * ```ts
 * resultFormat: {
 *   coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
 * }
 * ```
 *
 * Example 2: Qwen 2.5 returns pixel coordinates, but may return a point-like
 * value that needs custom parsing/fallback. The default pixel bbox mapper is
 * bypassed only if custom fallback sizing is required.
 *
 * ```ts
 * resultFormat: {
 *   coordinates: { shape: 'bbox', order: 'xy' },
 *   parseRawLocateValue: parseQwen25RawLocateValue,
 *   mapLocateResultToPixelBbox: normalizeQwen25ResultToPixelBbox,
 * }
 * ```
 *
 * Example 3: a model with a custom raw value shape can keep the standard
 * workflow while replacing parsing and mapping.
 *
 * ```ts
 * resultFormat: {
 *   coordinates: { shape: 'bbox', order: 'xy' },
 *   parseRawLocateValue: (raw) => ({
 *     coordinates: [
 *       Number((raw as any).left),
 *       Number((raw as any).top),
 *       Number((raw as any).right),
 *       Number((raw as any).bottom),
 *     ],
 *     coordinatesMeta: { shape: 'bbox', order: 'xy' },
 *   }),
 *   mapLocateResultToPixelBbox: (result) => result.coordinates,
 * }
 * ```
 */
export type LocateResultFormatDefinition = {
  /**
   * Common locate result coordinates shorthand. This is the preferred config surface
   * for normal models because it keeps result type, coordinate system, and
   * coordinate order in one orthogonal field.
   */
  coordinates: LocateResultCoordinates;
  /**
   * Parses one raw coordinate value into a `LocateResultValue`. This function
   * should handle response repair, bbox-vs-point fallback, and the coordinate
   * metadata that describes the parsed coordinates.
   */
  parseRawLocateValue?: RawLocateValueParser;
  /**
   * Maps the parsed result into a pixel bbox. Most models should omit this
   * and let `coordinates` drive the default conversion. Provide it only when point
   * fallback size, clipping, or coordinate semantics are model-specific.
   */
  mapLocateResultToPixelBbox?: LocateResultPixelBboxMapper;
};
