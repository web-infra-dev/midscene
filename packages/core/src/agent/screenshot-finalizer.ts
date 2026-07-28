import { ScreenshotItem } from '@/screenshot-item';
import type { Size } from '@/types';
import {
  canonicalizeScreenshotBase64,
  normalizeScreenshotBase64,
  resizeImgBase64,
} from '@midscene/shared/img';

export interface FinalizeScreenshotOptions {
  /** Resize before the final WebP encode. Omit to preserve dimensions. */
  targetSize?: Size;
  /** Error-message context for externally supplied screenshot data. */
  label?: string;
}

/**
 * Produce the canonical bytes shared by model requests and reports.
 *
 * Resizing and WebP conversion deliberately happen in the same operation so
 * a lossless/native producer source is not encoded as WebP twice. An existing
 * final WebP is passed through byte-for-byte when no resize is requested.
 */
export async function finalizeScreenshotBase64(
  inputBase64: string,
  options: FinalizeScreenshotOptions = {},
): Promise<string> {
  const normalized = normalizeScreenshotBase64(inputBase64, {
    label: options.label,
  });
  if (options.targetSize) {
    const resized = await resizeImgBase64(normalized, options.targetSize);
    return canonicalizeScreenshotBase64(resized);
  }

  return canonicalizeScreenshotBase64(normalized);
}

export async function createFinalizedScreenshotItem(
  inputBase64: string,
  capturedAt: number,
  options?: FinalizeScreenshotOptions,
): Promise<ScreenshotItem> {
  return ScreenshotItem.create(
    await finalizeScreenshotBase64(inputBase64, options),
    capturedAt,
  );
}
