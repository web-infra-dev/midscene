import { PageAgent, type PageAgentOpt } from '@/common/agent';
import { forceCloseTab } from '@/common/utils';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import { WebPage as PuppeteerWebPage } from './page';
const debug = getDebug('puppeteer:agent');

export { WebPage as PuppeteerWebPage } from './page';

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: PageAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);

    const { forceSameTabNavigation = true } = opts ?? {};

    if (forceSameTabNavigation) {
      forceCloseTab(page, debug);
    }
  }
}

export { overrideAIConfig } from '@midscene/shared/env';

// Do NOT export this since it requires puppeteer
// export { puppeteerAgentForTarget } from './agent-launcher';
