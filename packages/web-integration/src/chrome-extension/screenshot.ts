import type { Protocol as CDPTypes } from 'devtools-protocol';

export type ChromeExtensionScreenshotFormat = 'webp' | 'jpeg';

export const DEFAULT_CHROME_EXTENSION_SCREENSHOT_FORMAT: ChromeExtensionScreenshotFormat =
  'webp';

export async function captureChromeExtensionScreenshot(
  sendCaptureCommand: (
    params: CDPTypes.Page.CaptureScreenshotRequest,
  ) => Promise<CDPTypes.Page.CaptureScreenshotResponse>,
  format: ChromeExtensionScreenshotFormat = DEFAULT_CHROME_EXTENSION_SCREENSHOT_FORMAT,
): Promise<string> {
  const result = await sendCaptureCommand({
    format,
    quality: 90,
  });
  return `data:image/${format};base64,${result.data}`;
}
