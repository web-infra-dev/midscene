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
  /** Parse-only alternatives, tried in order after resultKey. */
  resultKeyAliases?: string[];
  resultValueSchema: string;
  resultValueDescription: string;
  resultNoun: string;
  resultNounPlural: string;
  exampleValues: NonEmptyArray<unknown>;
}

export interface PixelLocateResult {
  /** Bounds-aware bbox center (or raw point), mapped to pixels before final rounding and content clamping. */
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

export type NormalizationBasis = 'image-size' | 'last-pixel';

export type CoordinateRounding = 'round' | 'trunc' | 'none';

/** Applied to both axes: closed [min, max] or left-closed-right-open [min, max). */
export type BboxBoundsType = 'closed' | 'left-closed-right-open';

export interface LocateResultCoordinates {
  /** Bbox endpoint inclusion; defaults to closed. Used for interval lengths. */
  boundsType?: BboxBoundsType;
  shape: LocateResultShape;
  /** Axis order in the raw coordinates; defaults to xy. */
  order?: 'xy' | 'yx';
  /**
   * Input normalization scale, e.g. 1 or 1000, independent of boundsType.
   * normalizationBasis determines the target pixel scale.
   * Omit for model-image pixel coordinates.
   */
  normalizedBy?: number;
  /** Mapping multiplier: size (default) or size - 1. Ignored for pixel inputs. */
  normalizationBasis?: NormalizationBasis;
  /** Final pixel rounding for centers, bbox corners and distances, regardless of input units; defaults to round. Use none to retain subpixel precision. */
  rounding?: CoordinateRounding;
}

/** Coordinate metadata with defaults resolved and an explicit rounding policy. */
export type ResolvedLocateResultCoordinates =
  | {
      shape: 'point';
      order: 'xy' | 'yx';
      normalizedBy?: number;
      normalizationBasis: NormalizationBasis;
      rounding: CoordinateRounding;
    }
  | {
      shape: 'bbox';
      boundsType: BboxBoundsType;
      order: 'xy' | 'yx';
      normalizedBy?: number;
      normalizationBasis: NormalizationBasis;
      rounding: CoordinateRounding;
    };

/** Parser output may omit defaults; the codec resolves them before mapping. */
export type ParsedLocateResultValue =
  | {
      coordinates: LocateResultPoint;
      coordinatesMeta: LocateResultCoordinates & { shape: 'point' };
    }
  | {
      coordinates: LocateResultBbox;
      coordinatesMeta: LocateResultCoordinates & { shape: 'bbox' };
    };

export type RawLocateValueParser = (
  input: RawLocateValue,
) => ParsedLocateResultValue;

/**
 * Format of one model coordinate value, shared by element and search-area locate.
 * The operation protocol extracts target/reference values from the response;
 * the codec parses each value once and maps it to `{ center, rect }` using the
 * parsed result's coordinatesMeta. Rect is undefined for actual point results.
 * Raw-value parsing and final pixel rounding are configurable;
 * coordinate mapping is shared.
 */
export type LocateResultFormatDefinition = {
  /** Response field used in prompts and parsing; defaults to bbox or point. */
  resultKey?: string;
  /** Parse-only alternatives, tried in order when the primary field is undefined. */
  resultKeyAliases?: string[];
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
