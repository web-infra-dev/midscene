import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import type { Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';
import type { WebPageOpt } from '../web-element';

export class WebPage extends BasePage<'playwright', PlaywrightPageType> {
  waitForNavigationTimeout: number;
  waitForNetworkIdleTimeout: number;

  constructor(page: PlaywrightPageType, opts?: WebPageOpt) {
    super(page, 'playwright', opts);
    const {
      waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
      waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    } = opts ?? {};
    this.waitForNavigationTimeout = waitForNavigationTimeout;
    this.waitForNetworkIdleTimeout = waitForNetworkIdleTimeout;
  }
}
