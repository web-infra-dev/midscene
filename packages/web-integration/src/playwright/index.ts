import { Agent as PageAgent } from '@midscene/core/agent';

import {
  FileStorage,
  defaultFilePathResolver,
} from '@midscene/core/storage/file';
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
import { getWebpackRequire } from '../utils';

const debug = getDebug('playwright:agent');

/**
 * Get Playwright version from package.json
 */
function getPlaywrightVersion(): string | null {
  try {
    const playwrightPkg = getWebpackRequire()('playwright/package.json');
    return playwrightPkg.version || null;
  } catch (error) {
    console.error('[midscene:error] Failed to get Playwright version', error);
    return null;
  }
}

export class PlaywrightAgent extends PageAgent<PlaywrightWebPage> {
  constructor(page: PlaywrightPage, opts?: WebPageAgentOpt) {
    const webPage = new PlaywrightWebPage(page, opts);
    // Use FileStorage and defaultFilePathResolver for Node.js environment
    const storageProvider = opts?.storageProvider ?? new FileStorage();
    const filePathResolver = opts?.filePathResolver ?? defaultFilePathResolver;
    super(webPage, { ...opts, storageProvider, filePathResolver });

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    if (forceChromeSelectRendering) {
      // Check Playwright version requirement (>= 1.52)
      const playwrightVersion = getPlaywrightVersion();
      if (playwrightVersion && !semver.gte(playwrightVersion, '1.52.0')) {
        console.warn(
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
