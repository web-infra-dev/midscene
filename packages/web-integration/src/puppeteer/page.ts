import type { WebPageOpt } from '@/web-element';
import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage } from './base-page';

export interface PuppeteerViewportSyncResult {
  /** Whether the Puppeteer viewport configuration or SDK size was updated. */
  changed: boolean;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
}

// This function is serialized and evaluated in the browser context.
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
  private viewportSyncInProgress = false;

  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
  }

  /**
   * Adopt the current desktop viewport after another controller resized it.
   * Call between completed actions, with other browser controllers paused.
   * Keeps the current Page, Agent, report and persistent XPath caches in place.
   */
  async syncViewport(options?: {
    signal?: AbortSignal;
  }): Promise<PuppeteerViewportSyncResult> {
    options?.signal?.throwIfAborted();
    if (this.viewportSyncInProgress) {
      throw new Error('Viewport synchronization is already in progress');
    }

    this.viewportSyncInProgress = true;
    const page = this.underlyingPage;
    const assertActivePage = () => {
      options?.signal?.throwIfAborted();
      if (this.underlyingPage !== page || page.isClosed()) {
        throw new Error(
          'The active Page changed or closed during viewport synchronization',
        );
      }
    };

    try {
      assertActivePage();
      const configured = page.viewport();
      if (configured?.isMobile || configured?.hasTouch) {
        throw new Error(
          'Viewport synchronization supports desktop pages without touch emulation only',
        );
      }

      const actual = await page.evaluate(readViewportMetrics);
      assertActivePage();
      if (
        !Number.isInteger(actual.width) ||
        actual.width <= 0 ||
        !Number.isInteger(actual.height) ||
        actual.height <= 0 ||
        !Number.isFinite(actual.deviceScaleFactor) ||
        actual.deviceScaleFactor <= 0
      ) {
        throw new Error(
          'Cannot synchronize invalid live viewport dimensions or device scale factor',
        );
      }
      if (actual.hasTouch || !sameScale(actual.scale, 1)) {
        throw new Error(
          'Viewport synchronization supports desktop pages without touch emulation or pinch zoom only',
        );
      }

      const viewport = {
        width: actual.width,
        height: actual.height,
        deviceScaleFactor: actual.deviceScaleFactor,
      };
      const sizeChanged =
        this.viewportSize !== undefined &&
        (this.viewportSize.width !== actual.width ||
          this.viewportSize.height !== actual.height);
      const needsResize =
        configured !== null &&
        (configured.width !== actual.width ||
          configured.height !== actual.height ||
          !sameScale(
            configured.deviceScaleFactor ?? 1,
            actual.deviceScaleFactor,
          ));

      if (needsResize) {
        /* istanbul ignore next -- callback is serialized into the browser context */
        const originalDocument = await page.evaluateHandle(() => document);
        try {
          assertActivePage();
          // A failed or cancelled resize must not leave the old logical size cached.
          this.viewportSize = undefined;
          await page.setViewport({ ...configured, ...viewport });
          assertActivePage();
          const restored = await page.evaluate(
            readViewportMetrics,
            originalDocument,
          );
          assertActivePage();
          if (
            !restored.sameDocument ||
            restored.timeOrigin !== actual.timeOrigin ||
            restored.width !== actual.width ||
            restored.height !== actual.height ||
            !sameScale(restored.deviceScaleFactor, actual.deviceScaleFactor) ||
            !sameScale(restored.scale, 1) ||
            restored.hasTouch
          ) {
            throw new Error(
              'The document or viewport changed during synchronization; wait for the page to settle before retrying',
            );
          }
        } finally {
          // Navigation may already have destroyed the remote document handle.
          await originalDocument.dispose().catch(() => {});
        }
        assertActivePage();
      }

      if (!this.viewportSize || sizeChanged || needsResize) {
        this.viewportSize = { width: actual.width, height: actual.height };
      }
      return { changed: sizeChanged || needsResize, viewport };
    } finally {
      this.viewportSyncInProgress = false;
    }
  }
}
