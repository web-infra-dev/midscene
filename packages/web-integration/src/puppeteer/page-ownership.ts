import type { Browser, Page, Target } from 'puppeteer';

/**
 * Tracks the page tree rooted at one caller-owned Puppeteer page.
 *
 * A target belongs to the tree only when its opener is already owned. This
 * lets multiple BrowserAgent instances share one Browser without following or
 * cleaning up pages opened by another execution.
 */
export class PuppeteerPageOwnership {
  private readonly browser: Browser;
  private readonly ownedTargets = new Set<Target>();
  private released = false;

  private readonly handleTargetCreated = (target: Target) => {
    this.captureTarget(target);
  };

  constructor(initialPage: Page) {
    this.browser = initialPage.browser();
    this.trackPage(initialPage);
    this.browser.on('targetcreated', this.handleTargetCreated);
  }

  /** Track a page that was explicitly created or selected by the owner. */
  trackPage(page: Page): void {
    this.ownedTargets.add(page.target());
  }

  ownsPage(page: Page): boolean {
    return this.ownedTargets.has(page.target());
  }

  async pages(): Promise<Page[]> {
    const pages = await Promise.all(
      [...this.ownedTargets].map((target) => target.page()),
    );
    return pages.filter((page): page is Page =>
      Boolean(page && !page.isClosed()),
    );
  }

  /**
   * Capture a page target when it belongs to the owned opener tree.
   * Returns whether the target may be followed by the owning BrowserAgent.
   */
  captureTarget(target: Target): boolean {
    if (target.type() !== 'page') {
      return false;
    }
    if (this.ownedTargets.has(target)) {
      return true;
    }

    const opener = target.opener();
    if (!opener || !this.ownedTargets.has(opener)) {
      return false;
    }

    this.ownedTargets.add(target);
    return true;
  }

  /** Stop tracking without closing pages, for keepWindow flows. */
  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.browser.off('targetcreated', this.handleTargetCreated);
  }

  /** Close every live page in the owned tree, children before their opener. */
  async close(): Promise<void> {
    this.release();

    const cleanupErrors: unknown[] = [];
    const targets = [...this.ownedTargets].reverse();
    for (const target of targets) {
      try {
        const page = await target.page();
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'Failed to close one or more owned Puppeteer pages',
      );
    }
  }
}
