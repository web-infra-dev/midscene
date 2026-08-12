import { Buffer } from 'node:buffer';
import { imageInfoOfBase64 } from './info';
import {
  convertImgBufferToJpeg,
  createImgBase64ByFormat,
  parseBase64,
  resizeAndConvertImgBuffer,
} from './transform';

export const DEFAULT_MODEL_INPUT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MODEL_INPUT_IMAGE_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export const DEFAULT_MODEL_INPUT_IMAGE_MAX_LONG_EDGE = 2048;
export const DEFAULT_MODEL_INPUT_IMAGE_MIN_LONG_EDGE = 512;

export type ModelInputImageDegradedReason =
  | 'resized'
  | 'reencoded'
  | 'resized_and_reencoded';

export interface ModelInputImageNormalizationOptions {
  /** Decoded image byte budget. Defaults below the common 10 MiB limit. */
  maxBytes?: number;
  /** Longest output edge in pixels. */
  maxLongEdge?: number;
  /** Smallest long edge attempted before reporting a deterministic failure. */
  minLongEdge?: number;
}

/** Limits advertised by a model/provider for one multimodal request. */
export interface ModelInputImageCapabilities
  extends ModelInputImageNormalizationOptions {
  /** Aggregate decoded image bytes allowed in one request. */
  maxTotalBytes?: number;
  /** Maximum number of images allowed in one request. */
  maxImages?: number;
}

export interface ModelInputImageNormalizationDetails {
  originalBytes: number;
  finalBytes: number;
  originalSize: { width: number; height: number };
  finalSize: { width: number; height: number };
  format: string;
  degradedReason?: ModelInputImageDegradedReason;
}

export interface ModelInputImageNormalizationSuccess
  extends ModelInputImageNormalizationDetails {
  ok: true;
  imageBase64: string;
}

export interface ModelInputImageNormalizationFailure {
  ok: false;
  error: {
    code:
      | 'model_image_invalid'
      | 'model_image_too_large'
      | 'model_image_total_too_large'
      | 'model_image_count_exceeded';
    message: string;
  };
  originalBytes: number;
  originalSize?: { width: number; height: number };
  attemptedBytes?: number;
  attemptedSize?: { width: number; height: number };
}

export type ModelInputImageNormalizationResult =
  | ModelInputImageNormalizationSuccess
  | ModelInputImageNormalizationFailure;

export type ModelInputImageBatchNormalizationOptions =
  ModelInputImageCapabilities;

export interface ModelInputImageBatchNormalizationResult {
  images: Array<ModelInputImageNormalizationSuccess & { index: number }>;
  omitted: Array<ModelInputImageNormalizationFailure & { index: number }>;
  totalBytes: number;
}

function dimensionsForLongEdge(
  width: number,
  height: number,
  longEdge: number,
) {
  const currentLongEdge = Math.max(width, height);
  if (currentLongEdge <= longEdge) {
    return { width, height };
  }
  const scale = longEdge / currentLongEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function positiveCapability(
  name: keyof ModelInputImageCapabilities,
  value: number | undefined,
) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Model image capability ${name} must be positive.`);
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    throw new Error(`Model image capability ${name} must be at least 1.`);
  }
  return normalized;
}

/** Resolves explicit provider capabilities over conservative defaults. */
export function resolveModelInputImageCapabilities(
  capabilities: ModelInputImageCapabilities | undefined,
): Required<ModelInputImageCapabilities> {
  const maxBytes =
    positiveCapability('maxBytes', capabilities?.maxBytes) ??
    DEFAULT_MODEL_INPUT_IMAGE_MAX_BYTES;
  const maxTotalBytes =
    positiveCapability('maxTotalBytes', capabilities?.maxTotalBytes) ??
    DEFAULT_MODEL_INPUT_IMAGE_MAX_TOTAL_BYTES;
  const maxLongEdge =
    positiveCapability('maxLongEdge', capabilities?.maxLongEdge) ??
    DEFAULT_MODEL_INPUT_IMAGE_MAX_LONG_EDGE;
  const minLongEdge =
    positiveCapability('minLongEdge', capabilities?.minLongEdge) ??
    DEFAULT_MODEL_INPUT_IMAGE_MIN_LONG_EDGE;
  const maxImages =
    positiveCapability('maxImages', capabilities?.maxImages) ??
    Number.MAX_SAFE_INTEGER;
  if (minLongEdge > maxLongEdge) {
    throw new Error(
      'Model image capability minLongEdge must not exceed maxLongEdge.',
    );
  }
  return {
    maxBytes: Math.min(maxBytes, maxTotalBytes),
    maxTotalBytes,
    maxLongEdge,
    minLongEdge,
    maxImages,
  };
}

function degradedReason(
  originalSize: { width: number; height: number },
  finalSize: { width: number; height: number },
  originalFormat: string,
): ModelInputImageDegradedReason {
  const resized =
    originalSize.width !== finalSize.width ||
    originalSize.height !== finalSize.height;
  const reencoded = originalFormat !== 'image/jpeg';
  if (resized && reencoded) return 'resized_and_reencoded';
  return resized ? 'resized' : 'reencoded';
}

/**
 * Normalizes a screenshot before it enters a model request.
 *
 * The function never returns an image known to exceed `maxBytes`. When an
 * image cannot be brought under budget without shrinking below `minLongEdge`,
 * callers receive a structured failure and can omit the image explicitly.
 */
export async function normalizeImageForModel(
  imageBase64: string,
  options: ModelInputImageNormalizationOptions = {},
): Promise<ModelInputImageNormalizationResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MODEL_INPUT_IMAGE_MAX_BYTES;
  const maxLongEdge =
    options.maxLongEdge ?? DEFAULT_MODEL_INPUT_IMAGE_MAX_LONG_EDGE;
  const minLongEdge = Math.min(
    options.minLongEdge ?? DEFAULT_MODEL_INPUT_IMAGE_MIN_LONG_EDGE,
    maxLongEdge,
  );

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('normalizeImageForModel: maxBytes must be positive.');
  }
  if (!Number.isFinite(maxLongEdge) || maxLongEdge <= 0) {
    throw new Error('normalizeImageForModel: maxLongEdge must be positive.');
  }
  if (!Number.isFinite(minLongEdge) || minLongEdge <= 0) {
    throw new Error('normalizeImageForModel: minLongEdge must be positive.');
  }

  let parsed: ReturnType<typeof parseBase64>;
  let originalSize: { width: number; height: number };
  try {
    parsed = parseBase64(imageBase64);
    originalSize = await imageInfoOfBase64(imageBase64);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'model_image_invalid',
        message: `Model input image is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      originalBytes: 0,
    };
  }

  const inputBuffer = Buffer.from(parsed.body, 'base64');
  const originalBytes = inputBuffer.byteLength;
  const originalLongEdge = Math.max(originalSize.width, originalSize.height);
  if (originalBytes <= maxBytes && originalLongEdge <= maxLongEdge) {
    return {
      ok: true,
      imageBase64,
      originalBytes,
      finalBytes: originalBytes,
      originalSize,
      finalSize: originalSize,
      format: parsed.mimeType,
    };
  }

  const firstLongEdge = Math.min(originalLongEdge, maxLongEdge);
  const longEdgeAttempts = Array.from(
    new Set(
      [
        firstLongEdge,
        Math.round(firstLongEdge * 0.8),
        Math.round(firstLongEdge * 0.65),
        Math.round(firstLongEdge * 0.5),
        minLongEdge,
      ].map((value) => Math.max(minLongEdge, value)),
    ),
  ).sort((left, right) => right - left);
  const qualityAttempts = [85, 72, 60, 48];
  let attemptedBytes = originalBytes;
  let attemptedSize = originalSize;

  try {
    for (const longEdge of longEdgeAttempts) {
      const targetSize = dimensionsForLongEdge(
        originalSize.width,
        originalSize.height,
        longEdge,
      );
      for (const quality of qualityAttempts) {
        const sameSize =
          targetSize.width === originalSize.width &&
          targetSize.height === originalSize.height;
        const outputBuffer = sameSize
          ? await convertImgBufferToJpeg(inputBuffer, quality)
          : (
              await resizeAndConvertImgBuffer(
                parsed.mimeType.split('/')[1] || 'png',
                inputBuffer,
                targetSize,
                quality,
              )
            ).buffer;
        attemptedBytes = outputBuffer.byteLength;
        attemptedSize = targetSize;
        if (attemptedBytes <= maxBytes) {
          return {
            ok: true,
            imageBase64: createImgBase64ByFormat(
              'jpeg',
              outputBuffer.toString('base64'),
            ),
            originalBytes,
            finalBytes: attemptedBytes,
            originalSize,
            finalSize: targetSize,
            format: 'image/jpeg',
            degradedReason: degradedReason(
              originalSize,
              targetSize,
              parsed.mimeType,
            ),
          };
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'model_image_invalid',
        message: `Model input image normalization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      originalBytes,
      originalSize,
      attemptedBytes,
      attemptedSize,
    };
  }

  return {
    ok: false,
    error: {
      code: 'model_image_too_large',
      message: `Model input image remains ${attemptedBytes} bytes after normalization (limit ${maxBytes} bytes).`,
    },
    originalBytes,
    originalSize,
    attemptedBytes,
    attemptedSize,
  };
}

/** Normalizes an ordered image list and enforces a request-level byte budget. */
export async function normalizeImagesForModel(
  images: string[],
  options: ModelInputImageBatchNormalizationOptions = {},
): Promise<ModelInputImageBatchNormalizationResult> {
  const capabilities = resolveModelInputImageCapabilities(options);
  const { maxTotalBytes, maxImages } = capabilities;

  const normalized: ModelInputImageBatchNormalizationResult = {
    images: [],
    omitted: [],
    totalBytes: 0,
  };
  const maxImageBytes = capabilities.maxBytes;

  for (const [index, image] of images.entries()) {
    if (normalized.images.length >= maxImages) {
      normalized.omitted.push({
        index,
        ok: false,
        error: {
          code: 'model_image_count_exceeded',
          message: `Model image count budget of ${maxImages} is exhausted.`,
        },
        originalBytes: 0,
      });
      continue;
    }
    const remainingBytes = maxTotalBytes - normalized.totalBytes;
    if (remainingBytes <= 0) {
      normalized.omitted.push({
        index,
        ok: false,
        error: {
          code: 'model_image_total_too_large',
          message: `Model image payload budget of ${maxTotalBytes} bytes is exhausted.`,
        },
        originalBytes: 0,
      });
      continue;
    }

    const result = await normalizeImageForModel(image, {
      maxLongEdge: capabilities.maxLongEdge,
      minLongEdge: capabilities.minLongEdge,
      maxBytes: Math.min(maxImageBytes, remainingBytes),
    });
    if (!result.ok) {
      normalized.omitted.push({ ...result, index });
      continue;
    }
    normalized.images.push({ ...result, index });
    normalized.totalBytes += result.finalBytes;
  }

  return normalized;
}
