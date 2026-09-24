import { ScreenshotItem } from '@midscene/core';

export const transparentPixelPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function createPlaceholderScreenshot(): ScreenshotItem {
  return ScreenshotItem.create(transparentPixelPngBase64, Date.now());
}
