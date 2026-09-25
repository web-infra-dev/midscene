import { EncodedImage } from '@midscene/shared/img';
import { prepareImageOutput } from '../image-output';

export interface PrepareRawScreenshotOptions {
  shrinkFactor?: number;
}

function resizeOperations(source: EncodedImage, shrinkFactor: number) {
  if (!Number.isFinite(shrinkFactor) || shrinkFactor < 1) {
    throw new Error(
      `Invalid screenshotShrinkFactor: must be a finite number >= 1. Received: ${shrinkFactor}`,
    );
  }
  if (shrinkFactor === 1) return [];
  const width = Math.round(source.size.width / shrinkFactor);
  const height = Math.round(source.size.height / shrinkFactor);
  if (width <= 0 || height <= 0) {
    throw new Error(
      'Invalid prepared screenshot dimensions: width and height must be positive',
    );
  }
  return [{ type: 'resize' as const, width, height }];
}

/** Finish user-requested shrinking before the screenshot enters UIContext. */
export async function prepareRawScreenshot(
  screenshot: string | EncodedImage,
  options?: PrepareRawScreenshotOptions,
): Promise<EncodedImage> {
  const source =
    typeof screenshot === 'string'
      ? EncodedImage.fromBase64(screenshot)
      : screenshot;
  const operations = resizeOperations(source, options?.shrinkFactor ?? 1);
  return operations.length ? prepareImageOutput(source, operations) : source;
}

/** Observation frames use the same resize geometry and choose encoding at persistence. */
export async function prepareScreenshotForPersistence(
  screenshot: string | EncodedImage,
  options?: PrepareRawScreenshotOptions,
): Promise<EncodedImage> {
  const source =
    typeof screenshot === 'string'
      ? EncodedImage.fromBase64(screenshot)
      : screenshot;
  return prepareImageOutput(
    source,
    resizeOperations(source, options?.shrinkFactor ?? 1),
  );
}
