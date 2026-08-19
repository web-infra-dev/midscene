import {
  type JpegBase64DataUrl,
  imageInfoOfBase64,
  resizeBase64ImageToJpeg,
} from '@midscene/shared/img';
import type { Size } from '../types';

const SCREENSHOT_JPEG_QUALITY = 90;

export interface PrepareRawScreenshotOptions {
  shrinkFactor?: number;
}

export interface PreparedScreenshot {
  base64: JpegBase64DataUrl;
  originalSize: Size;
  shotSize: Size;
}

function assertValidSize(size: Size, label: string): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new Error(
      `Invalid ${label}: width and height must be finite numbers. Received width: ${size.width}, height: ${size.height}`,
    );
  }
  if (size.width <= 0 || size.height <= 0) {
    throw new Error(
      `Invalid ${label}: width and height must be positive numbers. Received width: ${size.width}, height: ${size.height}`,
    );
  }
}

/**
 * Prepare one raw screenshot for model context or observation persistence.
 * Each raw screenshot must pass through this pipeline at most once.
 */
export async function prepareRawScreenshot(
  screenshotBase64: string,
  options?: PrepareRawScreenshotOptions,
): Promise<PreparedScreenshot> {
  const shrinkFactor = options?.shrinkFactor ?? 1;
  if (!Number.isFinite(shrinkFactor) || shrinkFactor < 1) {
    throw new Error(
      `Invalid screenshotShrinkFactor: must be a finite number >= 1. Received: ${shrinkFactor}`,
    );
  }

  const originalSize = await imageInfoOfBase64(screenshotBase64);
  assertValidSize(originalSize, 'screenshot dimensions');

  const shotSize =
    shrinkFactor > 1
      ? {
          width: Math.round(originalSize.width / shrinkFactor),
          height: Math.round(originalSize.height / shrinkFactor),
        }
      : { ...originalSize };
  assertValidSize(shotSize, 'prepared screenshot dimensions');

  const base64 = await resizeBase64ImageToJpeg(screenshotBase64, {
    sourceSize: originalSize,
    targetSize: shotSize,
    jpegQuality: SCREENSHOT_JPEG_QUALITY,
  });

  return {
    base64,
    originalSize,
    shotSize,
  };
}
