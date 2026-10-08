import type { Page } from 'puppeteer-core';
import type { ViewportSize } from './viewport';

/** Keep the content size after the CLI disconnects its CDP session. */
export async function setPersistentPuppeteerViewport(
  page: Page,
  viewport: ViewportSize,
): Promise<void> {
  // Emulation is session-scoped. Measure the native content area before
  // applying it, otherwise Chrome's window frame is hidden by the override.
  await page.setViewport(null);
  // Browser-realm callbacks cannot reference Node's Istanbul counters.
  const frame = await page.evaluate(
    /* istanbul ignore next */ () => ({
      width: Math.max(0, window.outerWidth - window.innerWidth),
      height: Math.max(0, window.outerHeight - window.innerHeight),
    }),
  );
  const session = await page.createCDPSession();
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        width: viewport.width + frame.width,
        height: viewport.height + frame.height,
      },
    });
    await page.waitForFunction(
      /* istanbul ignore next */ (size) =>
        window.innerWidth === size.width && window.innerHeight === size.height,
      { timeout: 5_000 },
      viewport,
    );
  } finally {
    await session.detach();
  }
  await page.setViewport(viewport);
}
