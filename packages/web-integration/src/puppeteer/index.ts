import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { Page as PuppeteerPage } from 'puppeteer';
import { WebPage as PuppeteerWebPage } from './page';

export { WebPage as PuppeteerWebPage } from './page';
export class PuppeteerAgent extends PageAgent {
  constructor(page: PuppeteerPage, opts?: PageAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);
  }
}

export { overrideAIConfig } from '@midscene/core';
