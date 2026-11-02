import type { WebPageOpt } from '@/web-element';
import type { Size } from '@midscene/core';
import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage, debugPage } from './base-page';
import { withPuppeteerScreenshotLock } from './screenshot';
import { observePageSize } from './size-observer';

export class PuppeteerWebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  private sizeObserver: ReturnType<typeof observePageSize>;
  private sizeUpdate = Promise.resolve();
  private disposed = false;

  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
    this.sizeObserver = this.observeSize(page);
  }

  private observeSize(page: PuppeteerPageType) {
    return observePageSize(page, (size) =>
      this.underlyingPage === page
        ? this.onSizeChange(size)
        : Promise.resolve(),
    );
  }

  setPage(page: PuppeteerPageType) {
    if (this.underlyingPage === page) return;
    void this.sizeObserver.dispose();
    this.underlyingPage = page;
    this.viewportSize = undefined;
    this.sizeObserver = this.observeSize(page);
  }

  // The event is a notification; read current metrics inside the queue rather
  // than writing potentially outdated event dimensions back into the browser.
  async onSizeChange(_size: Size): Promise<void> {
    const page = this.underlyingPage;
    this.sizeUpdate = withPuppeteerScreenshotLock(page.browser(), async () => {
      if (this.disposed || this.underlyingPage !== page || page.isClosed())
        return;
      const configured = page.viewport();
      if (configured?.isMobile || configured?.hasTouch) return;
      /* istanbul ignore next -- serialized into the browser */
      const actual = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
        hasTouch: navigator.maxTouchPoints > 0,
        scale: window.visualViewport?.scale ?? 1,
      }));
      if (
        this.disposed ||
        this.underlyingPage !== page ||
        actual.hasTouch ||
        actual.scale !== 1 ||
        !Number.isInteger(actual.width) ||
        actual.width <= 0 ||
        !Number.isInteger(actual.height) ||
        actual.height <= 0 ||
        !Number.isFinite(actual.deviceScaleFactor) ||
        actual.deviceScaleFactor <= 0
      )
        return;
      if (
        configured &&
        (configured.width !== actual.width ||
          configured.height !== actual.height ||
          Math.abs(
            (configured.deviceScaleFactor ?? 1) - actual.deviceScaleFactor,
          ) > 1e-6)
      ) {
        await page.setViewport({
          ...configured,
          width: actual.width,
          height: actual.height,
          deviceScaleFactor: actual.deviceScaleFactor,
        });
      }
      if (!this.disposed && this.underlyingPage === page) {
        this.viewportSize = { width: actual.width, height: actual.height };
      }
    }).catch((error) => {
      debugPage('Optional size-change recovery failed: %s', error);
    });
    await this.sizeUpdate;
  }

  override async size(): Promise<Size> {
    await this.sizeObserver.ready;
    await this.sizeUpdate;
    return super.size();
  }

  override async screenshotBase64(): Promise<string> {
    await this.sizeObserver.ready;
    return super.screenshotBase64();
  }

  override async destroy(): Promise<void> {
    this.disposed = true;
    await this.sizeObserver.dispose();
    await this.sizeUpdate;
  }
}
