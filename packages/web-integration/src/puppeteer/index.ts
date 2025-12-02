import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import semver from 'semver';
import {
  forceChromeSelectRendering as applyChromeSelectRendering,
  forceClosePopup,
} from './base-page';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

/**
 * Get Puppeteer version from package.json
 */
function getPuppeteerVersion(): string | null {
  try {
    // Try to require puppeteer package.json
    const puppeteerPkg = require('puppeteer/package.json');
    return puppeteerPkg.version || null;
  } catch {
    return null;
  }
}

export { PuppeteerWebPage } from './page';
export type { WebPageAgentOpt } from '@/web-element';

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: WebPageAgentOpt) {
    const webPage = new PuppeteerWebPage(page, opts);
    super(webPage, opts);

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    if (forceChromeSelectRendering) {
      const puppeteerVersion = getPuppeteerVersion();
      if (puppeteerVersion && !semver.gte(puppeteerVersion, '24.6.0')) {
        throw new Error(
          `[midscene:error] forceChromeSelectRendering requires Puppeteer > 24.6.0, but current version is ${puppeteerVersion}. This feature may not work correctly.`,
        );
      }
      applyChromeSelectRendering(page);
    }
  }
}

export { overrideAIConfig } from '@midscene/shared/env';

// Do NOT export this since it requires puppeteer
// export { puppeteerAgentForTarget } from './agent-launcher';
