import type { CDPSession, Page } from 'puppeteer';

/**
 * Controls browser window state (minimize/restore) during task execution
 * to avoid interference between the playground UI and desktop automation.
 */
export class BrowserWindowController {
  private session: CDPSession;
  private page: Page;
  private windowId: number;

  constructor(session: CDPSession, page: Page, windowId: number) {
    this.session = session;
    this.page = page;
    this.windowId = windowId;
  }

  async minimize(): Promise<void> {
    try {
      await this.session.send('Browser.setWindowBounds', {
        windowId: this.windowId,
        bounds: { windowState: 'minimized' },
      });
      console.log('🔽 Window minimized, starting task execution...');
    } catch (error) {
      console.warn('⚠️  Failed to minimize window:', error);
    }
  }

  async restore(): Promise<void> {
    try {
      await Promise.all([
        this.session.send('Browser.setWindowBounds', {
          windowId: this.windowId,
          bounds: { windowState: 'normal' },
        }),
        this.page.bringToFront(),
      ]);
      console.log('🔼 Window restored');
    } catch (error) {
      console.warn('⚠️  Failed to restore window:', error);
    }
  }
}
