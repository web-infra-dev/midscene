import { Agent as PageAgent } from '@midscene/core/agent';
import type { Page as PlaywrightPage } from 'playwright';
import { WebPage as PlaywrightWebPage } from './page';

export type { PlayWrightAiFixtureType } from './ai-fixture';
export { PlaywrightAiFixture } from './ai-fixture';
export { overrideAIConfig } from '@midscene/shared/env';
export { WebPage as PlaywrightWebPage } from './page';
export type { WebPageAgentOpt } from '@/web-element';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import semver from 'semver';
import {
  forceChromeSelectRendering as applyChromeSelectRendering,
  forceClosePopup,
} from '../puppeteer/base-page';

const debug = getDebug('playwright:agent');

/**
 * Get Playwright version from package.json
 */
function getPlaywrightVersion(): string | null {
  try {
    // Try to require playwright package.json
    const playwrightPkg = require('playwright/package.json');
    return playwrightPkg.version || null;
  } catch {
    return null;
  }
}

export class PlaywrightAgent extends PageAgent<PlaywrightWebPage> {
  constructor(page: PlaywrightPage, opts?: WebPageAgentOpt) {
    const webPage = new PlaywrightWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    if (forceChromeSelectRendering) {
      // Check Playwright version requirement (>= 1.52)
      const playwrightVersion = getPlaywrightVersion();
      if (playwrightVersion && !semver.gte(playwrightVersion, '1.52.0')) {
        throw new Error(
          `[midscene:error] forceChromeSelectRendering requires Playwright >= 1.52.0, but current version is ${playwrightVersion}. This feature may not work correctly.`,
        );
      }
      applyChromeSelectRendering(page);
    }
  }

  async waitForNetworkIdle(timeout = 1000) {
    await this.page.underlyingPage.waitForLoadState('networkidle', { timeout });
  }
}
