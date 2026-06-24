import type { Bbox } from '../../../types';

export type { Bbox };
export type LocateResultBbox = Bbox;
export type PixelBbox = Bbox;
export type NonEmptyArray<T> = [T, ...T[]];
export type RawLocateValue = unknown;

export type LocateResultValue =
  | { type: 'bbox'; coordinates: LocateResultBbox }
  | { type: 'point'; coordinates: [number, number] };

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

export interface SectionLocatePixelBboxGroup {
  target: PixelBbox;
  references?: PixelBbox[];
}

export interface LocateResultAdapter {
  promptSpec: LocateResultPromptSpec;
  /**
   * Converts a locate payload to a pixel bbox. This adapter intentionally does
   * not interpret model-level `error` / `errors` fields; callers decide whether
   * those fields should stop the locate flow before invoking the adapter.
   */
  adaptElementLocateResultToPixelBbox(
    input: unknown,
    ctx: LocateResultContext,
  ): PixelBbox;
  /**
   * Converts a section locate payload to target/reference pixel bboxes. This
   * adapter intentionally does not interpret model-level `error` / `errors`
   * fields; callers own that policy before invoking the adapter.
   */
  adaptSectionLocateResultToPixelBboxGroup(
    input: unknown,
    ctx: LocateResultContext,
  ): SectionLocatePixelBboxGroup;
  adaptPlanningParamToPixelBbox(
    planningParam: unknown,
    ctx: LocateResultContext,
  ): PixelBbox;
}

export interface LocateResultCoordinates {
  shape: LocateResultShape;
  order?: 'xy' | 'yx';
  normalizedBy?: number;
}

export interface ResolvedLocateResultCoordinates {
  shape: LocateResultShape;
  order: 'xy' | 'yx';
  normalizedBy?: number;
}

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
 *    `{ type: 'bbox' | 'point', coordinates: ... }`. Omit it when the model
 *    returns a plain numeric bbox/point matching `coordinates`; provide it when the
 *    model needs repair or fallback handling.
 * 3. `mapLocateResultToPixelBbox` converts the parsed result into a pixel bbox
 *    `[left, top, right, bottom]`. Omit it when `coordinates` is enough to describe
 *    the coordinate system and order; provide it only for model-specific
 *    conversion rules.
 *
 * Standard adapters intentionally use fixed result fields (`bbox` / `bbox_2d` /
 * `point` and `references_*`). A previous design considered `pickRawLocateValue`
 * for custom keys, but normal locate, search-area references, and future
 * locateAll responses may return different shapes (single arrays, nested
 * arrays, or object arrays), so a generic picker contract was unclear. A
 * declarative `resultKeys` option is one possible future direction, but without
 * a concrete need we avoid that over-design for now.
 *
 * Example 1: a GLM-like model that directly matches the standard coordinates.
 *
 * ```ts
 * resultAdapter: {
 *   coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
 * }
 * ```
 *
 * Example 2: Qwen 2.5 returns pixel coordinates, but may return a point-like
 * value that needs custom parsing/fallback. The default pixel bbox mapper is
 * bypassed only if custom fallback sizing is required.
 *
 * ```ts
 * resultAdapter: {
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
 * resultAdapter: {
 *   coordinates: { shape: 'bbox', order: 'xy' },
 *   parseRawLocateValue: (raw) => ({
 *     type: 'bbox',
 *     coordinates: [
 *       Number((raw as any).left),
 *       Number((raw as any).top),
 *       Number((raw as any).right),
 *       Number((raw as any).bottom),
 *     ],
 *   }),
 *   mapLocateResultToPixelBbox: (result) => result.coordinates,
 * }
 * ```
 */
export type StandardLocateResultAdapterDefinition = {
  kind?: 'standard';
  /**
   * Common locate result coordinates shorthand. This is the preferred config surface
   * for normal models because it keeps result type, coordinate system, and
   * coordinate order in one orthogonal field.
   */
  coordinates: LocateResultCoordinates;
  /**
   * Parses the picked raw value into a `LocateResultValue`. This function
   * should handle response repair and bbox-vs-point fallback only;
   * coordinate-system conversion should stay in `mapLocateResultToPixelBbox`.
   */
  parseRawLocateValue?: RawLocateValueParser;
  /**
   * Maps the parsed result into a pixel bbox. Most models should omit this
   * and let `coordinates` drive the default conversion. Provide it only when point
   * fallback size, clipping, or coordinate semantics are model-specific.
   */
  mapLocateResultToPixelBbox?: LocateResultPixelBboxMapper;
};

export type CustomLocateResultAdapterDefinition = {
  kind: 'custom';
  promptSpec: LocateResultPromptSpec;
  adaptElementLocateResultToPixelBbox(
    input: unknown,
    ctx: LocateResultContext,
  ): PixelBbox;
  adaptSectionLocateResultToPixelBboxGroup(
    input: unknown,
    ctx: LocateResultContext,
  ): SectionLocatePixelBboxGroup;
  adaptPlanningParamToPixelBbox(
    planningParam: unknown,
    ctx: LocateResultContext,
  ): PixelBbox;
};

export type LocateResultAdapterDefinition =
  | StandardLocateResultAdapterDefinition
  | CustomLocateResultAdapterDefinition;
