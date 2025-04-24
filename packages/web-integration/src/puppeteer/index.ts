import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { Page as PuppeteerPage } from 'puppeteer';
import { WebPage as PuppeteerWebPage } from './page';

export { WebPage as PuppeteerWebPage } from './page';

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: PageAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);

    const { forceSameTabNavigation = true } = opts ?? {};

    if (forceSameTabNavigation) {
      page.on('popup', async (popup) => {
        if (!popup) {
          console.warn(
            'got a popup event, but the popup is not ready yet, skip',
          );
          return;
        }
        const url = await popup.url();
        console.log(`Popup opened: ${url}`);
        await popup.close(); // Close the newly opened TAB
        await page.goto(url);
      });
    }
  }
}

export { overrideAIConfig } from '@midscene/shared/env';

// Do NOT export this since it requires puppeteer
// export { puppeteerAgentForTarget } from './agent-launcher';
