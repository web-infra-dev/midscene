import {
  type BrowserAgentAdapter,
  BrowserPageManager,
  type ResolvedBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import type { DebugFunction } from '@midscene/shared/logger';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
  Target as PuppeteerTarget,
} from 'puppeteer';
import type { PuppeteerWebPage } from './page';

export interface PuppeteerBrowserPageScope {
  pages(): Promise<PuppeteerPage[]>;
  trackPage(page: PuppeteerPage): void;
  ownsPage(page: PuppeteerPage): boolean;
  captureTarget(target: PuppeteerTarget): boolean;
}

const createPuppeteerBrowserAdapter = (
  browser: PuppeteerBrowser,
  pageScope?: PuppeteerBrowserPageScope,
): BrowserAgentAdapter<PuppeteerPage, PuppeteerTarget> => ({
  pages: () => pageScope?.pages() ?? browser.pages(),
  newPage: async () => {
    const page = await browser.newPage();
    pageScope?.trackPage(page);
    return page;
  },
  isPageClosed: (page) => page.isClosed(),
  isPageAllowed: (page) => pageScope?.ownsPage(page) ?? true,
  bringToFront: (page) => page.bringToFront(),
  onNewPage: (handler) => browser.on('targetcreated', handler),
  offNewPage: (handler) => browser.off('targetcreated', handler),
  isNewPageEvent: (target) =>
    target.type() === 'page' && (pageScope?.captureTarget(target) ?? true),
  resolveNewPage: (target) => target.page(),
});

export function createPuppeteerBrowserPageManager({
  browser,
  webPage,
  runtimeOptions,
  debug,
  pageScope,
}: {
  browser: PuppeteerBrowser;
  webPage: PuppeteerWebPage;
  runtimeOptions: ResolvedBrowserAgentRuntimeOptions;
  debug: DebugFunction;
  pageScope?: PuppeteerBrowserPageScope;
}) {
  return new BrowserPageManager({
    agentName: 'PuppeteerBrowserAgent',
    adapter: createPuppeteerBrowserAdapter(browser, pageScope),
    getActivePage: () => webPage.underlyingPage as PuppeteerPage,
    setActivePageValue: (page) => {
      webPage.underlyingPage = page;
    },
    autoFollowNewPage: runtimeOptions.autoFollowNewPage,
    newPageTimeout: runtimeOptions.newPageTimeout,
    debug,
  });
}
