import type { TModelFamily } from '@midscene/shared/env';
import { zoomForGPT4o } from '@midscene/shared/img';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ImageDetail,
  ModelAdapterDefinition,
} from '../model-adapter/types';
import type {
  LocateResultContext,
  LocateResultValue,
  PixelBbox,
} from '../shared/model-locate-result';

const originalImageDetailForDefaultIntent = (
  input: ChatCompletionCallContext,
): ImageDetail | undefined =>
  input.intent === 'default' || input.requiresOriginalImageDetail
    ? 'original'
    : undefined;

/**
 * Side length in pixels of the synthetic bounding box generated when the model
 * returns a single point instead of a full bbox. The point becomes the top-left
 * corner of the box.
 */
const defaultPointBboxSize = 20;

/**
 * Maps a single coordinate from GPT's internal model space to the actual
 * image pixel space using linear interpolation.
 *
 * GPT4o-family models may process images at a different resolution than the
 * original. This function rescales one axis from [0, modelSize-1] to
 * [0, actualSize-1].
 *
 * @param value      - Coordinate value in model space.
 * @param modelSize  - Total size of that axis in model space (e.g. zoomed width).
 * @param actualSize - Total size of that axis in actual pixel space.
 */
function scaleGptLocateCoordinate(
  value: number,
  modelSize: number,
  actualSize: number,
): number {
  return Math.round(
    (value * Math.max(actualSize - 1, 0)) / Math.max(modelSize - 1, 1),
  );
}

/**
 * Converts a raw GPT locate result into a pixel bounding box in the
 * coordinate space of the original (un-zoomed) image.
 *
 * GPT4o zooms images to a fixed resolution before inference. When the zoomed
 * dimensions differ from the original, coordinates reported by the model are
 * in that zoomed space and must be scaled back. If the coordinates already
 * fall outside the model space (e.g. the model returned original-space values
 * directly), they are returned as-is to avoid double-scaling.
 *
 * For point results the function synthesises a small fixed-size bbox centred
 * on the reported point (top-left corner = the point itself).
 *
 * @param result - Parsed locate result, either a bbox or a point.
 * @param ctx    - Context carrying the prepared image dimensions.
 * @returns Pixel bbox [left, top, right, bottom] in original image space.
 */
function normalizeGptLocateResultToPixelBbox(
  result: LocateResultValue,
  ctx: LocateResultContext,
): PixelBbox {
  const { width, height } = ctx.preparedSize;
  // Compute the dimensions GPT4o used when it processed the image.
  const modelSpace = zoomForGPT4o(width, height);

  // Build the raw bbox: use the four reported coordinates for bbox results,
  // or synthesise a fixed-size box from a single point.
  const rawBbox: PixelBbox =
    result.type === 'bbox'
      ? [
          Math.round(result.coordinates[0]),
          Math.round(result.coordinates[1]),
          Math.round(result.coordinates[2]),
          Math.round(result.coordinates[3]),
        ]
      : [
          Math.round(result.coordinates[0]),
          Math.round(result.coordinates[1]),
          Math.round(result.coordinates[0] + defaultPointBboxSize),
          Math.round(result.coordinates[1] + defaultPointBboxSize),
        ];

  // If the model space matches the actual image size, no rescaling is needed.
  if (modelSpace.width === width && modelSpace.height === height) {
    return rawBbox;
  }

  const [left, top, right, bottom] = rawBbox;
  // Heuristic: if the bbox fits within the model space it was likely reported
  // in model-space coordinates and needs rescaling. If it doesn't fit, assume
  // the model already returned pixel-space coordinates and return as-is.
  const looksLikeModelSpaceCoordinates =
    left >= 0 &&
    top >= 0 &&
    right <= modelSpace.width &&
    bottom <= modelSpace.height;

  if (!looksLikeModelSpaceCoordinates) {
    return rawBbox;
  }

  // Rescale each edge from model space to actual pixel space.
  return [
    scaleGptLocateCoordinate(left, modelSpace.width, width),
    scaleGptLocateCoordinate(top, modelSpace.height, height),
    scaleGptLocateCoordinate(right, modelSpace.width, width),
    scaleGptLocateCoordinate(bottom, modelSpace.height, height),
  ];
}

/**
 * Builds the chat-completion request parameters for GPT-5.
 *
 * GPT-5 uses `reasoning_effort` (a string level) rather than a token budget.
 * `reasoningBudget` is therefore listed as unsupported. When reasoning is
 * disabled the effort is forced to `'none'`; when enabled it defaults to
 * `'medium'` unless the caller specifies a different effort string.
 *
 * @param input - Call context including Midscene defaults and user overrides.
 * @returns The merged config object to pass to the chat-completion API.
 */
const buildGpt5ChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  // Map the boolean reasoning flag to the string effort level expected by GPT-5.
  const effectiveReasoningEffort =
    reasoningEnabled === true ? (reasoningEffort ?? 'medium') : 'none';

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      reasoning_effort: effectiveReasoningEffort,
    },
  };
};

/**
 * Model adapter definitions for the GPT family.
 *
 * Each entry satisfies `ModelAdapterDefinition` and is keyed by the
 * `TModelFamily` string used throughout the codebase. Currently only
 * `'gpt-5'` is defined here; add further GPT variants as new keys.
 */
export const gptAdapters = {
  'gpt-5': {
    chatCompletion: {
      // Token-budget reasoning is not supported; callers should use reasoningEffort instead.
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildGpt5ChatCompletionParams,
      resolveImageDetail: originalImageDetailForDefaultIntent,
    },
    locate: {
      resultAdapter: {
        // GPT-5 returns pixel-space xy bboxes; custom mapper handles model-space rescaling.
        coordinates: { shape: 'bbox', order: 'xy' },
        mapLocateResultToPixelBbox: normalizeGptLocateResultToPixelBbox,
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gpt-5'>;
