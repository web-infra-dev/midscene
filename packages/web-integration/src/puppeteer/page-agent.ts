import {
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import { forceClosePopup } from './base-page';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

export class PuppeteerPageAgent extends WebAgentCore<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: WebPageAgentOpt) {
    if (!page) {
      throw new Error(
        '[midscene] PuppeteerPageAgent requires a valid Puppeteer page instance. Please make sure to pass a valid page object.',
      );
    }
    const webPage = new PuppeteerWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation, forceChromeSelectRendering } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PuppeteerPageAgent',
      pageScope: 'page',
      forceSameTabNavigation,
    });

    if (runtimeOptions.forceSameTabNavigation) {
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
