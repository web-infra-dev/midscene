import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage } from './base-page';

export class WebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  constructor(page: PuppeteerPageType) {
    super(page, 'puppeteer');
  }

  async waitUntilNetworkIdle(options?: {
    idleTime?: number;
    concurrency?: number;
    timeout?: number;
  }): Promise<void> {
    await this.underlyingPage.waitForNetworkIdle({
      idleTime: options?.idleTime || 300,
      concurrency: options?.concurrency || 2,
      timeout: options?.timeout || 15000,
    });
  }
}
