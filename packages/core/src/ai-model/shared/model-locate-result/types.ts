import type { Rect } from '@midscene/shared/types';
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

export interface PixelLocateResult {
  /** Raw bbox midpoint (or raw point), mapped to the locate image using the configured rounding. */
  center: LocateResultPoint;
  /**
   * Original bbox mapped to locate-image pixels and clipped to content bounds.
   * Undefined for point results; never derive center or click coordinates from it.
   */
  rect?: Rect;
}

export interface LocateResultCodec {
  promptSpec: LocateResultPromptSpec;
  /** Parse once and independently map the center and optional original bbox. */
  toPixelResult(
    input: RawLocateValue,
    ctx: LocateResultContext,
  ): PixelLocateResult;
}

export type CoordinateRounding = 'round' | 'trunc' | 'none';

export interface LocateResultCoordinates {
  shape: LocateResultShape;
  /** Axis order in the raw coordinates; defaults to xy. */
  order?: 'xy' | 'yx';
  /** Normalization range, e.g. 1 or 1000. Omit for model-image pixel coordinates. */
  normalizedBy?: number;
  /** Rounding after normalized-to-pixel mapping; defaults to round. Pixel inputs retain their precision. */
  rounding?: CoordinateRounding;
}

/** Coordinate metadata with defaults resolved and an explicit rounding policy. */
export type ResolvedLocateResultCoordinates =
  | {
      shape: 'point';
      order: 'xy' | 'yx';
      normalizedBy?: number;
      rounding: CoordinateRounding;
    }
  | {
      shape: 'bbox';
      order: 'xy' | 'yx';
      normalizedBy?: number;
      rounding: CoordinateRounding;
    };

export type RawLocateValueParser = (input: RawLocateValue) => LocateResultValue;

/**
 * Format of one model coordinate value, shared by element and search-area locate.
 * The operation protocol extracts target/reference values from the response;
 * the codec parses each value once and maps it to `{ center, rect }` using the
 * parsed result's coordinatesMeta. Rect is undefined for actual point results.
 * Raw-value parsing and normalized-coordinate rounding are configurable;
 * coordinate mapping is shared.
 */
export type LocateResultFormatDefinition = {
  /**
   * Expected shape, axis order, and normalization used by the prompt and default
   * parser. A custom parser may return different metadata for an actual response.
   */
  coordinates: LocateResultCoordinates;
  /**
   * Optional model-specific parser for nonstandard formats or point/bbox fallback.
   * Return `{ coordinates, coordinatesMeta }` describing the actual shape, axis
   * order, and normalization. Preserve coordinate precision; do not round or map
   * to pixels here. Include an explicit rounding policy in `coordinatesMeta`.
   * Omit the parser to parse numeric values according to `coordinates`.
   */
  parseRawLocateValue?: RawLocateValueParser;
};
