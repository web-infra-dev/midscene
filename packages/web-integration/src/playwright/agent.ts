import {
  applyForceChromeSelectRendering,
  isRetryableBrowserNavigationError,
} from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PlaywrightPage } from 'playwright';
import { forceClosePopup } from '../puppeteer/base-page';
import { WebPage as PlaywrightWebPage } from './page';

const debug = getDebug('playwright:agent');

export class PlaywrightAgent extends PageAgent<PlaywrightWebPage> {
  protected isRetryableContextError(error: unknown): boolean {
    return isRetryableBrowserNavigationError(error);
  }

  constructor(page: PlaywrightPage, opts?: WebPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PlaywrightAgent requires a valid Playwright page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PlaywrightWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    applyForceChromeSelectRendering(
      page,
      'playwright',
      forceChromeSelectRendering,
    );
  }
}
