import type { Browser, Page, ScreenshotOptions } from 'puppeteer';

const pendingScreenshots = new WeakMap<Browser, Promise<void>>();

export async function capturePuppeteerScreenshot(
  page: Page,
  options: ScreenshotOptions & { encoding: 'base64' },
): Promise<string> {
  return withPuppeteerScreenshotLock(page.browser(), async () => {
    // Keep activation and capture together so background tabs produce frames.
    await page.bringToFront();
    return page.screenshot(options);
  });
}

// Size-change recovery shares this queue without adding work to each screenshot.
export async function withPuppeteerScreenshotLock<T>(
  browser: Browser,
  run: () => Promise<T>,
): Promise<T> {
  const previous = pendingScreenshots.get(browser) ?? Promise.resolve();
  const capture = previous.then(run);
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
