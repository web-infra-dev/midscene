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
      | 'model_image_total_too_large';
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

export interface ModelInputImageBatchNormalizationOptions
  extends ModelInputImageNormalizationOptions {
  maxTotalBytes?: number;
}

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
  const maxTotalBytes =
    options.maxTotalBytes ?? DEFAULT_MODEL_INPUT_IMAGE_MAX_TOTAL_BYTES;
  if (!Number.isFinite(maxTotalBytes) || maxTotalBytes <= 0) {
    throw new Error('normalizeImagesForModel: maxTotalBytes must be positive.');
  }

  const normalized: ModelInputImageBatchNormalizationResult = {
    images: [],
    omitted: [],
    totalBytes: 0,
  };
  const maxImageBytes = options.maxBytes ?? DEFAULT_MODEL_INPUT_IMAGE_MAX_BYTES;

  for (const [index, image] of images.entries()) {
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
      ...options,
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
