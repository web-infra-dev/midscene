import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { Page as PuppeteerPage } from 'puppeteer';
import { Page as PuppeteerWebPage } from './page';

export { Page as PuppeteerWebPage } from './page';
export class PuppeteerAgent extends PageAgent {
  constructor(page: PuppeteerPage, opts?: PageAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);
  }
}
