import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';

import { FileStorage } from '@midscene/core/storage/file';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import semver from 'semver';
import { getWebpackRequire } from '../utils';
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
    const puppeteerPkg = getWebpackRequire()('puppeteer/package.json');
    return puppeteerPkg.version || null;
  } catch (error) {
    console.error('[midscene:error] Failed to get Puppeteer version', error);
    return null;
  }
}

export { PuppeteerWebPage } from './page';
export type { WebPageAgentOpt } from '@/web-element';

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: WebPageAgentOpt) {
    const webPage = new PuppeteerWebPage(page, opts);
    // Use FileStorage for Node.js environment (Puppeteer runs in Node.js)
    const storageProvider = opts?.storageProvider ?? new FileStorage();
    super(webPage, { ...opts, storageProvider });

    const { forceSameTabNavigation = true, forceChromeSelectRendering } =
      opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }

    if (forceChromeSelectRendering) {
      const puppeteerVersion = getPuppeteerVersion();
      if (puppeteerVersion && !semver.gte(puppeteerVersion, '24.6.0')) {
        console.warn(
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
