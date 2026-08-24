import type { WebPageOpt } from '@/web-element';
import type {
  Dialog as PuppeteerDialog,
  Page as PuppeteerPageType,
} from 'puppeteer';
import { AlertVirtualSurface } from './alert-virtual-surface';
import { Page as BasePage, debugPage } from './base-page';

export class PuppeteerWebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  private readonly nativeDialogHandler = (dialog: PuppeteerDialog) => {
    void this.handleNativeDialog(dialog).catch((error) => {
      debugPage('native dialog handling failed: %s', error);
    });
  };

  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
    page.on('dialog', this.nativeDialogHandler);
  }

  private async handleNativeDialog(dialog: PuppeteerDialog): Promise<void> {
    if (dialog.type() !== 'alert') return;

    const viewportSize = this.getLastKnownViewportSize() ??
      this.underlyingPage.viewport() ?? { width: 1280, height: 720 };
    const surface = new AlertVirtualSurface(dialog.message(), viewportSize);
    const virtualLease = this.surfaceRouter.activateVirtualSurface(surface);

    try {
      await surface.waitForDecision();
      const resumingLease = this.surfaceRouter.beginResuming(virtualLease);
      await dialog.accept();
      await this.surfaceRouter.waitForInterruptedRealOperations();
      if (this.surfaceRouter.isCurrentLease(resumingLease)) {
        this.surfaceRouter.finishResuming(resumingLease);
      }
    } catch (error) {
      await this.surfaceRouter
        .waitForInterruptedRealOperations()
        .catch(() => undefined);
      const currentLease = this.surfaceRouter.acquireLease();
      if (currentLease.mode !== 'real') {
        this.surfaceRouter.resetToReal(currentLease);
      }
      throw error;
    }
  }

  override async destroy(): Promise<void> {
    this.underlyingPage.off('dialog', this.nativeDialogHandler);
    await super.destroy();
  }
}
