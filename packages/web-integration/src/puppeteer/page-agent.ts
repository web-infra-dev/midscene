import {
  applyForceChromeSelectRendering,
  isRetryableBrowserNavigationError,
} from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import { forceClosePopup } from './base-page';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

export class PuppeteerPageAgent extends PageAgent<PuppeteerWebPage> {
  protected isRetryableContextError(error: unknown): boolean {
    return isRetryableBrowserNavigationError(error);
  }

  constructor(page: PuppeteerPage, opts?: WebPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PuppeteerPageAgent requires a valid Puppeteer page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PuppeteerWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    applyForceChromeSelectRendering(
      page,
      'puppeteer',
      forceChromeSelectRendering,
    );
  }
}

export { PuppeteerPageAgent as PuppeteerAgent };
