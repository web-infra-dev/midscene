import { resolveBrowserAgentRuntimeOptions } from '@/common/browser-agent';
import { getDebug } from '@midscene/shared/logger';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
} from 'puppeteer';
import {
  PuppeteerBrowserAgent,
  type PuppeteerBrowserAgentOpt,
} from './browser-agent';
import { createPuppeteerBrowserPageManager } from './browser-page-manager';
import type { PuppeteerPageOwnership } from './page-ownership';

const debug = getDebug('puppeteer:browser-agent');

class ScopedPuppeteerBrowserAgent extends PuppeteerBrowserAgent {
  constructor(
    browser: PuppeteerBrowser,
    initialPage: PuppeteerPage,
    opts: PuppeteerBrowserAgentOpt | undefined,
    pageOwnership: PuppeteerPageOwnership,
  ) {
    const { autoFollowNewPage, newPageTimeout } = opts ?? {};
    super(browser, initialPage, {
      ...opts,
      autoFollowNewPage: false,
    });

    this.pageManager.destroy();
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PuppeteerBrowserAgent',
      pageScope: 'browser',
      autoFollowNewPage,
      newPageTimeout,
    });
    this.pageManager = createPuppeteerBrowserPageManager({
      browser,
      webPage: this.interface,
      runtimeOptions,
      debug,
      pageScope: pageOwnership,
    });
  }
}

export function createScopedPuppeteerBrowserAgent(
  browser: PuppeteerBrowser,
  initialPage: PuppeteerPage,
  opts: PuppeteerBrowserAgentOpt | undefined,
  pageOwnership: PuppeteerPageOwnership,
): PuppeteerBrowserAgent {
  return new ScopedPuppeteerBrowserAgent(
    browser,
    initialPage,
    opts,
    pageOwnership,
  );
}
