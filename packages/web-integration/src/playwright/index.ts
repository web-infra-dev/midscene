import { Agent as PageAgent } from '@midscene/core/agent';
import type { Page as PlaywrightPage } from 'playwright';
import { WebPage as PlaywrightWebPage } from './page';

export type { PlayWrightAiFixtureType } from './ai-fixture';
export { PlaywrightAiFixture } from './ai-fixture';
export { overrideAIConfig } from '@midscene/shared/env';
export { WebPage as PlaywrightWebPage } from './page';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import { forceClosePopup } from '../puppeteer/base-page';

const debug = getDebug('playwright:agent');

export class PlaywrightAgent extends PageAgent<PlaywrightWebPage> {
  constructor(page: PlaywrightPage, opts?: WebPageAgentOpt) {
    const webPage = new PlaywrightWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true } = opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }
  }

  async waitForNetworkIdle(timeout = 1000) {
    await this.page.underlyingPage.waitForLoadState('networkidle', { timeout });
  }
}
