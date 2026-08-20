import {
  type BrowserAgentAdapter,
  BrowserPageManager,
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
  Target as PuppeteerTarget,
} from 'puppeteer';
import { PuppeteerWebPage } from './page';
import type { PuppeteerPageOwnership } from './page-ownership';

const debug = getDebug('puppeteer:browser-agent');

const createPuppeteerBrowserAdapter = (
  browser: PuppeteerBrowser,
  pageOwnership?: PuppeteerPageOwnership,
): BrowserAgentAdapter<PuppeteerPage, PuppeteerTarget> => ({
  pages: () => browser.pages(),
  newPage: async () => {
    const page = await browser.newPage();
    pageOwnership?.trackPage(page);
    return page;
  },
  isPageClosed: (page) => page.isClosed(),
  bringToFront: (page) => page.bringToFront(),
  onNewPage: (handler) => browser.on('targetcreated', handler),
  offNewPage: (handler) => browser.off('targetcreated', handler),
  isNewPageEvent: (target) =>
    target.type() === 'page' && (pageOwnership?.captureTarget(target) ?? true),
  resolveNewPage: (target) => target.page(),
});

export type PuppeteerBrowserAgentOpt = Omit<
  WebPageAgentOpt,
  'forceSameTabNavigation'
> & {
  autoFollowNewPage?: boolean;
  newPageTimeout?: number;
};

export type PuppeteerBrowserAgentCreateOpt = PuppeteerBrowserAgentOpt & {
  initialPage?: PuppeteerPage;
};

export class PuppeteerBrowserAgent extends WebAgentCore<PuppeteerWebPage> {
  private readonly pageManager: BrowserPageManager<
    PuppeteerPage,
    PuppeteerTarget
  >;

  constructor(
    browser: PuppeteerBrowser,
    initialPage: PuppeteerPage,
    opts?: PuppeteerBrowserAgentOpt,
    private readonly pageOwnership?: PuppeteerPageOwnership,
  ) {
    if (!browser) {
      throw new Error(
        '[midscene] PuppeteerBrowserAgent requires a valid Puppeteer browser instance.',
      );
    }
    if (!initialPage) {
      throw new Error(
        '[midscene] PuppeteerBrowserAgent requires a valid initial page instance.',
      );
    }

    const { autoFollowNewPage, newPageTimeout, ...agentOpts } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PuppeteerBrowserAgent',
      pageScope: 'browser',
      forceSameTabNavigation: (opts as WebPageAgentOpt | undefined)
        ?.forceSameTabNavigation,
      autoFollowNewPage,
      newPageTimeout,
    });
    const { forceChromeSelectRendering } = agentOpts;
    const webPage = new PuppeteerWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: runtimeOptions.forceSameTabNavigation,
    });
    const pageManager = new BrowserPageManager({
      agentName: 'PuppeteerBrowserAgent',
      adapter: createPuppeteerBrowserAdapter(browser, pageOwnership),
      getActivePage: () => webPage.underlyingPage as PuppeteerPage,
      setActivePageValue: (page) => {
        webPage.underlyingPage = page;
      },
      autoFollowNewPage: runtimeOptions.autoFollowNewPage,
      newPageTimeout: runtimeOptions.newPageTimeout,
      debug,
    });
    super(webPage, agentOpts);
    this.pageManager = pageManager;

    applyForceChromeSelectRendering(
      initialPage,
      'puppeteer',
      forceChromeSelectRendering,
    );
  }

  static async create(
    browser: PuppeteerBrowser,
    opts?: PuppeteerBrowserAgentCreateOpt,
    pageOwnership?: PuppeteerPageOwnership,
  ) {
    const { initialPage, ...agentOpts } = opts ?? {};
    const page =
      initialPage ?? (await browser.pages())[0] ?? (await browser.newPage());

    return new PuppeteerBrowserAgent(browser, page, agentOpts, pageOwnership);
  }

  get activePage() {
    return this.pageManager.activePage;
  }

  pages() {
    return this.pageManager.pages();
  }

  async newPage() {
    return this.pageManager.newPage();
  }

  async setActivePage(page: PuppeteerPage) {
    this.pageOwnership?.trackPage(page);
    await this.pageManager.setActivePage(page);
  }

  async waitForNewPage(
    action?: () => Promise<unknown> | unknown,
    opts?: { timeout?: number },
  ) {
    return this.pageManager.waitForNewPage(action, opts);
  }

  async destroy() {
    this.pageManager.destroy();
    await super.destroy();
  }
}
