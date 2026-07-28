import type { ScreenshotRef } from '@midscene/core';
import {
  screenshotImageExtension,
  screenshotImageFormatFromMimeType,
} from '@midscene/shared/img/image-format';

export function resolveScreenshotFallbackPath(ref: ScreenshotRef): string {
  const format = screenshotImageFormatFromMimeType(ref.mimeType);
  if (!format) {
    throw new Error(
      `Unsupported screenshot mime type: ${String(ref.mimeType)}`,
    );
  }

  if (ref.storage === 'file' && ref.path) {
    return ref.path;
  }

  return `./screenshots/${ref.id}.${screenshotImageExtension(format)}`;
}
