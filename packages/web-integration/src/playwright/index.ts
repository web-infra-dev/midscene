import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { Page as PlaywrightPage } from 'playwright';
import { WebPage as PlaywrightWebPage } from './page';

export type { PlayWrightAiFixtureType } from './ai-fixture';
export { PlaywrightAiFixture } from './ai-fixture';
export { overrideAIConfig } from '@midscene/core/env';
export { WebPage as PlaywrightWebPage } from './page';

export class PlaywrightAgent extends PageAgent<PlaywrightWebPage> {
  waitForNetworkIdle?: (
    page: PlaywrightPage,
    timeout?: number,
  ) => Promise<void>;

  constructor(page: PlaywrightPage, opts?: PageAgentOpt) {
    const webPage = new PlaywrightWebPage(page);
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
