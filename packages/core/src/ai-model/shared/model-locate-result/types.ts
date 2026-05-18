export type Bbox = [number, number, number, number];

export type LocateResultValue =
  | { type: 'bbox'; coordinates: Bbox }
  | { type: 'point'; coordinates: [number, number] };

export interface LocateResultContext {
  width: number;
  height: number;
}

export interface LocateResultResponseFormat {
  resultType: LocateResultValue['type'];
  coordinateSystem: 'normalized-0-1000' | 'actual-pixel';
  coordinateOrder?: 'xyxy' | 'yxyx';
  locateResultFormatDescriptor?: string;
}

export type LocateResultAdapter = {
  responseFormat: LocateResultResponseFormat;
  extractRawLocateResult(input: unknown): unknown | undefined;
  resolveLocateResult(input: unknown): LocateResultValue;
  normalizeResultToPixelBbox(
    result: LocateResultValue,
    ctx: LocateResultContext,
  ): Bbox;
};

export type LocateResultFormatPreset =
  | 'bbox-normalized-0-1000-xyxy'
  | 'bbox-normalized-0-1000-yxyx'
  | 'bbox-actual-pixel-xyxy'
  | 'point-normalized-0-1000-xy'
  | 'point-actual-pixel-xy';

export type LocateResultExtractorPreset = 'bbox-or-bbox_2d';
export type LocateResultExtractor = (input: unknown) => unknown | undefined;

/**
 * Declarative config for the standard locate workflow.
 *
 * The standard workflow has four steps:
 * 1. `format` is expanded into prompt wording (`responseFormat`), a default
 *    raw result resolver, and a default pixel bbox normalizer.
 * 2. `extract` reads the raw result value from the locate/planning output
 *    object. By default, bbox formats accept `{ bbox }` and `{ bbox_2d }`,
 *    while point formats read `{ point }`.
 * 3. `resolve` converts that raw result value into Midscene's internal
 *    `LocateResultValue` shape: `{ type: 'bbox' | 'point', coordinates: ... }`.
 *    Omit it when the model returns a plain numeric bbox/point matching
 *    `format`; provide it when the model needs repair or fallback handling.
 * 4. `normalize` converts the resolved result into a pixel bbox
 *    `[left, top, right, bottom]`. Omit it when `format` is enough to describe
 *    the coordinate system and order; provide it only for model-specific
 *    conversion rules.
 *
 * Example 1: a GLM-like model that directly matches the standard format.
 *
 * ```ts
 * resultAdapter: {
 *   format: 'bbox-normalized-0-1000-xyxy',
 * }
 * ```
 *
 * Example 2: Qwen 2.5 returns pixel coordinates, but may return a point-like
 * value that needs custom parsing/fallback. The default pixel normalizer is
 * bypassed only if custom fallback sizing is required.
 *
 * ```ts
 * resultAdapter: {
 *   format: 'bbox-actual-pixel-xyxy',
 *   resolve: resolveQwen25LocateResult,
 *   normalize: normalizeQwen25ResultToPixelBbox,
 * }
 * ```
 *
 * Example 3: a model with a completely incompatible response shape can replace
 * every step while still using the standard locate workflow around it.
 *
 * ```ts
 * resultAdapter: {
 *   format: 'bbox-actual-pixel-xyxy',
 *   locateResultFormatDescriptor: 'screen rectangle',
 *   extract: (output) => (output as any).result?.region,
 *   resolve: (raw) => ({
 *     type: 'bbox',
 *     coordinates: [
 *       Number((raw as any).left),
 *       Number((raw as any).top),
 *       Number((raw as any).right),
 *       Number((raw as any).bottom),
 *     ],
 *   }),
 *   normalize: (result) => result.coordinates,
 * }
 * ```
 */
export type LocateResultAdapterDefinition = {
  /**
   * Common locate result format shorthand. This is the preferred config surface
   * for normal models because it keeps result type, coordinate system, and
   * coordinate order in one orthogonal field.
   */
  format: LocateResultFormatPreset;
  /**
   * Optional prompt descriptor for the locate result format. Defaults to `2d
   * bounding box` for bbox formats and `point` for point formats. Gemini uses
   * this to ask for `box_2d bounding box` while still reusing the standard
   * resolver and normalizer.
   */
  locateResultFormatDescriptor?: string;
  /**
   * Extracts the raw result value from the model's locate/planning output.
   * By default, bbox formats read `output.bbox ?? output.bbox_2d`, while point
   * formats read `output.point`. Use a function when a provider nests the
   * result in a different field.
   */
  extract?: LocateResultExtractorPreset | LocateResultExtractor;
  /**
   * Resolves the extracted raw result into a `LocateResultValue`. This function
   * should handle response repair and bbox-vs-point fallback only;
   * coordinate-system conversion should stay in `normalize`.
   */
  resolve?: LocateResultAdapter['resolveLocateResult'];
  /**
   * Converts the resolved result into a pixel bbox. Most models should omit this
   * and let `format` drive the default conversion. Provide it only when point
   * fallback size, clipping, or coordinate semantics are model-specific.
   */
  normalize?: LocateResultAdapter['normalizeResultToPixelBbox'];
};
