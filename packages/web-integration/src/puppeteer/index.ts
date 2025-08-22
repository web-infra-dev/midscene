import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import { forceClosePopup } from './base-page';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

export { PuppeteerWebPage } from './page';

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: WebPageAgentOpt) {
    const webPage = new PuppeteerWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true } = opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }
  }
}

export { overrideAIConfig } from '@midscene/shared/env';

// Do NOT export this since it requires puppeteer
// export { puppeteerAgentForTarget } from './agent-launcher';
