import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIME,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage } from './base-page';

export type PuppeteerPageOpt = {
  waitForNavigationTimeout?: number;
  waitForNetworkIdleTimeout?: number;
};

export class WebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  waitForNavigationTimeout: number;
  waitForNetworkIdleTimeout: number;

  constructor(page: PuppeteerPageType, opts?: PuppeteerPageOpt) {
    super(page, 'puppeteer');
    const {
      waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
      waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    } = opts ?? {};
    this.waitForNavigationTimeout = waitForNavigationTimeout;
    this.waitForNetworkIdleTimeout = waitForNetworkIdleTimeout;
  }

  async waitUntilNetworkIdle(options?: {
    idleTime?: number;
    concurrency?: number;
    timeout?: number;
  }): Promise<void> {
    await this.underlyingPage.waitForNetworkIdle({
      idleTime: options?.idleTime ?? DEFAULT_WAIT_FOR_NETWORK_IDLE_TIME,
      concurrency:
        options?.concurrency ?? DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
      timeout: options?.timeout ?? this.waitForNetworkIdleTimeout,
    });
  }
}
