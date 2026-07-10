import {
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PlaywrightPage } from 'playwright';
import { forceClosePopup } from '../puppeteer/base-page';
import { WebPage as PlaywrightWebPage } from './page';

const debug = getDebug('playwright:agent');

export class PlaywrightPageAgent extends WebAgentCore<PlaywrightWebPage> {
  constructor(page: PlaywrightPage, opts?: WebPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PlaywrightPageAgent requires a valid Playwright page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PlaywrightWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation, forceChromeSelectRendering } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PlaywrightPageAgent',
      pageScope: 'page',
      forceSameTabNavigation,
    });

    if (runtimeOptions.forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    applyForceChromeSelectRendering(
      page,
      'playwright',
      forceChromeSelectRendering,
    );
  }
}

export { PlaywrightPageAgent as PlaywrightAgent };
