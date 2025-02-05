import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { Page as PuppeteerPage } from 'puppeteer';
import { WebPage as PuppeteerWebPage } from './page';

export { WebPage as PuppeteerWebPage } from './page';

export class PuppeteerAgent extends PageAgent {
  constructor(page: PuppeteerPage, opts?: PageAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);

    if (opts?.trackingActiveTab) {
      // @ts-expect-error
      const browser = (this.page as PuppeteerWebPage).underlyingPage.browser();

      browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const targetPage = await target.page();
          if (!targetPage) {
            console.warn(
              'got a targetPage event, but the page is not ready yet, skip',
            );
            return;
          }
          const midscenePage = new PuppeteerWebPage(targetPage);
          this.page = midscenePage;
          this.taskExecutor.page = midscenePage;
        }
      });
    }
  }
}

export { overrideAIConfig } from '@midscene/core/env';

export { puppeteerAgentForTarget } from './agent-launcher';
