import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import type { Page as PuppeteerPageType } from 'puppeteer';
import type { WebPageOpt } from '../common/agent';
import { Page as BasePage, debugPage } from './base-page';

export class WebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  waitForNavigationTimeout: number;
  waitForNetworkIdleTimeout: number;

  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
    const {
      waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
      waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    } = opts ?? {};
    this.waitForNavigationTimeout = waitForNavigationTimeout;
    this.waitForNetworkIdleTimeout = waitForNetworkIdleTimeout;
  }

  async beforeAction(): Promise<void> {
    await this.waitUntilNetworkIdle();
  }

  async waitUntilNetworkIdle(): Promise<void> {
    if (this.waitForNetworkIdleTimeout === 0) {
      debugPage('waitUntilNetworkIdle timeout is 0, skip waiting');
      return;
    }
    await this.underlyingPage.waitForNetworkIdle({
      idleTime: this.waitForNetworkIdleTimeout,
      concurrency: DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
      timeout: this.waitForNetworkIdleTimeout,
    });
  }
}
