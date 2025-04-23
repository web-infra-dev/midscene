import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage } from './base-page';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIME,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
} from '@midscene/shared/constants';

export class WebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  waitForNavigationTimeout: number;
  waitForNetworkIdleTimeout: number;

  constructor(
    page: PuppeteerPageType,
    opts?: {
      waitForNavigationTimeout?: number;
      waitForNetworkIdleTimeout?: number;
    },
  ) {
    super(page, 'puppeteer');
    const {
      waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
      waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    } = opts ?? {};
    this.waitForNavigationTimeout = waitForNavigationTimeout;
    this.waitForNetworkIdleTimeout = waitForNetworkIdleTimeout;
  }

  async waitUntilNetworkIdle(options?: {
    idleTime?: number; // 500ms -> 100ms
    concurrency?: number; // 0 -> 2
    timeout?: number; // 30000ms -> 800
  }): Promise<void> {
    await this.underlyingPage.waitForNetworkIdle({
      idleTime: options?.idleTime || DEFAULT_WAIT_FOR_NETWORK_IDLE_TIME,
      concurrency:
        options?.concurrency || DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
      timeout: options?.timeout || this.waitForNetworkIdleTimeout,
    });
  }
}
