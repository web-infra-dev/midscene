import { EncodedImage } from '@midscene/shared/img';
import { prepareImageOutput } from '../image-output';
import type { Size } from '../types';

export interface PrepareRawScreenshotOptions {
  shrinkFactor?: number;
}

export interface PreparedScreenshot {
  image: EncodedImage;
  base64: string;
  originalSize: Size;
  shotSize: Size;
}

function geometry(source: EncodedImage, shrinkFactor: number) {
  if (!Number.isFinite(shrinkFactor) || shrinkFactor < 1) {
    throw new Error(
      `Invalid screenshotShrinkFactor: must be a finite number >= 1. Received: ${shrinkFactor}`,
    );
  }
  const originalSize = source.size;
  const shotSize = {
    width: Math.round(originalSize.width / shrinkFactor),
    height: Math.round(originalSize.height / shrinkFactor),
  };
  if (shotSize.width <= 0 || shotSize.height <= 0) {
    throw new Error(
      'Invalid prepared screenshot dimensions: width and height must be positive',
    );
  }
  return { originalSize, shotSize };
}

/** Plan context geometry without encoding. Consumers apply shotSize in their pipeline. */
export async function prepareRawScreenshot(
  screenshot: string | EncodedImage,
  options?: PrepareRawScreenshotOptions,
): Promise<PreparedScreenshot> {
  const source =
    typeof screenshot === 'string'
      ? EncodedImage.fromBase64(screenshot)
      : screenshot;
  const { originalSize, shotSize } = geometry(
    source,
    options?.shrinkFactor ?? 1,
  );
  return {
    image: source,
    get base64() {
      return source.toBase64();
    },
    originalSize,
    shotSize,
  };
}

/** Reports prefer WebP for PNG sources, but never transcode unchanged JPEG/WebP. */
export async function prepareScreenshotForPersistence(
  screenshot: string | EncodedImage,
  options?: PrepareRawScreenshotOptions,
): Promise<EncodedImage> {
  const shrinkFactor = options?.shrinkFactor ?? 1;
  const source =
    typeof screenshot === 'string'
      ? EncodedImage.fromBase64(screenshot)
      : screenshot;
  const operations =
    shrinkFactor === 1
      ? []
      : [
          {
            type: 'resize' as const,
            ...geometry(source, shrinkFactor).shotSize,
          },
        ];
  return prepareImageOutput(source, operations);
}
