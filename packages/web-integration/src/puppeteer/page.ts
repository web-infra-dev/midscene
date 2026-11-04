import type { WebPageOpt } from '@/web-element';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import type { JSHandle, Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage, debugPage } from './base-page';
import { withPuppeteerScreenshotLock } from './screenshot';

// Serialized into the browser; never close over Node-side state.
/* istanbul ignore next */
function readViewportMetrics(expectedDocument?: Document) {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio,
    scale: window.visualViewport?.scale ?? 1,
    hasTouch: navigator.maxTouchPoints > 0,
    timeOrigin: performance.timeOrigin,
    sameDocument: !expectedDocument || document === expectedDocument,
  };
}

function sameScale(a: number, b: number) {
  return Math.abs(a - b) < 1e-6;
}

export class PuppeteerWebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
  }

  override async screenshotBase64(): Promise<string> {
    const configured = this.underlyingPage.viewport();
    if (configured?.isMobile || configured?.hasTouch) {
      return super.screenshotBase64();
    }
    return (await this.captureScreenshotWithSize()).screenshotBase64;
  }

  // Fresh AI observations and direct screenshots share this path. Frozen
  // contexts and already captured frames retain their original coordinates.
  async screenshotWithSize() {
    // Existing subclasses may provide cropped screenshots or custom dimensions.
    // Preserve that contract instead of silently bypassing their overrides.
    if (
      this.screenshotBase64 !== PuppeteerWebPage.prototype.screenshotBase64 ||
      this.size !== BasePage.prototype.size
    ) {
      return {
        size: await this.size(),
        screenshotBase64: await this.screenshotBase64(),
      };
    }
    return this.captureScreenshotWithSize();
  }

  private async captureScreenshotWithSize() {
    const page = this.underlyingPage;
    const configured = page.viewport();
    // Do not change the existing mobile/touch emulation contract.
    if (configured?.isMobile || configured?.hasTouch) {
      return {
        size: await super.size(),
        screenshotBase64: await super.screenshotBase64(),
      };
    }

    return withPuppeteerScreenshotLock(page.browser(), async () => {
      const assertActivePage = () => {
        if (this.underlyingPage !== page || page.isClosed()) {
          throw new Error(
            'The active Page changed or closed during screenshot capture',
          );
        }
      };
      assertActivePage();
      await page.bringToFront();
      const actual = await page.evaluate(readViewportMetrics);
      assertActivePage();
      const capture = async () =>
        createImgBase64ByFormat(
          'jpeg',
          await page.screenshot({
            type: 'jpeg',
            quality: 90,
            encoding: 'base64',
          }),
        );
      if (actual.hasTouch || !sameScale(actual.scale, 1)) {
        return { size: await super.size(), screenshotBase64: await capture() };
      }
      if (
        !Number.isInteger(actual.width) ||
        actual.width <= 0 ||
        !Number.isInteger(actual.height) ||
        actual.height <= 0 ||
        !Number.isFinite(actual.deviceScaleFactor) ||
        actual.deviceScaleFactor <= 0
      ) {
        throw new Error(
          'Cannot capture invalid live viewport dimensions or device scale factor',
        );
      }

      // Read configuration inside the queue: another capture may have repaired it.
      const current = page.viewport();
      if (current?.isMobile || current?.hasTouch) {
        throw new Error('Viewport emulation changed during screenshot capture');
      }
      // Resolve DPR=0 (system default) from browser metrics, without inspecting
      // image pixels. Once adopted, stable captures do not rewrite emulation.
      const needsResize =
        current !== null &&
        (current.width !== actual.width ||
          current.height !== actual.height ||
          !sameScale(current.deviceScaleFactor ?? 1, actual.deviceScaleFactor));
      let originalDocument: JSHandle<Document> | undefined;
      try {
        if (needsResize) {
          /* istanbul ignore next -- serialized into the browser */
          originalDocument = await page.evaluateHandle(() => document);
          assertActivePage();
          this.viewportSize = undefined;
          await page.setViewport({
            ...current,
            width: actual.width,
            height: actual.height,
            deviceScaleFactor: actual.deviceScaleFactor,
          });
          assertActivePage();
          debugPage('Automatically adopted live viewport: %o', actual);
        }
        const screenshotBase64 = await capture();
        const after = await page.evaluate(
          readViewportMetrics,
          originalDocument,
        );
        assertActivePage();
        if (
          !after.sameDocument ||
          after.timeOrigin !== actual.timeOrigin ||
          after.width !== actual.width ||
          after.height !== actual.height ||
          !sameScale(after.deviceScaleFactor, actual.deviceScaleFactor) ||
          !sameScale(after.scale, 1) ||
          after.hasTouch
        ) {
          throw new Error(
            'The document or viewport changed during screenshot capture; wait for other browser controllers to settle before retrying',
          );
        }
        const size = { width: actual.width, height: actual.height };
        this.viewportSize = size;
        return { size, screenshotBase64 };
      } catch (error) {
        this.viewportSize = undefined;
        throw error;
      } finally {
        await originalDocument?.dispose().catch(() => {});
      }
    });
  }
}
