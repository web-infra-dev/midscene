import { PageAgent, type PageAgentOpt } from '@/common/agent';
import { forceClosePopup } from '@/common/utils';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { AndroidDeviceInputOpt } from '../common/page';
import { type PuppeteerPageOpt, WebPage as PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

export { WebPage as PuppeteerWebPage } from './page';
export type { AndroidDeviceInputOpt };
export type PuppeteerAgentOpt = PageAgentOpt & PuppeteerPageOpt;

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: PuppeteerAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
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
