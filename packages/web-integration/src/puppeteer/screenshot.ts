import type { Browser, Page, ScreenshotOptions } from 'puppeteer';

const pendingScreenshots = new WeakMap<Browser, Promise<void>>();

export async function capturePuppeteerScreenshot(
  page: Page,
  options: ScreenshotOptions & { encoding: 'base64' },
): Promise<string>;
export async function capturePuppeteerScreenshot(
  page: Page,
  options: ScreenshotOptions & { encoding: 'binary' },
): Promise<Uint8Array>;
export async function capturePuppeteerScreenshot(
  page: Page,
  options: ScreenshotOptions,
): Promise<string | Uint8Array> {
  const browser = page.browser();
  const previous = pendingScreenshots.get(browser) ?? Promise.resolve();
  const capture = previous.then(async () => {
    // Background tabs can stop producing frames in headless Chrome. Keep
    // activation and capture together so another Midscene screenshot cannot
    // activate its tab before this capture finishes.
    await page.bringToFront();
    return page.screenshot(options);
  });
  const settled = capture.then(
    () => {},
    () => {},
  );
  pendingScreenshots.set(browser, settled);
  try {
    return await capture;
  } finally {
    if (pendingScreenshots.get(browser) === settled) {
      pendingScreenshots.delete(browser);
    }
  }
}
