import {
  type BrowserAgentAdapter,
  BrowserAgentPageController,
  appendBrowserAgentPageActions,
  createBrowserAgentPageActions,
} from '@/common/browser-agent';
import {
  applyForceChromeSelectRendering,
  isRetryableBrowserNavigationError,
} from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
  Target as PuppeteerTarget,
} from 'puppeteer';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:browser-agent');

const createPuppeteerBrowserAdapter = (
  browser: PuppeteerBrowser,
): BrowserAgentAdapter<PuppeteerPage, PuppeteerTarget> => ({
  pages: () => browser.pages(),
  newPage: () => browser.newPage(),
  isPageClosed: (page) => page.isClosed(),
  bringToFront: (page) => page.bringToFront(),
  pageTitle: (page) => page.title(),
  pageUrl: (page) => page.url(),
  onNewPage: (handler) => browser.on('targetcreated', handler),
  offNewPage: (handler) => browser.off('targetcreated', handler),
  isNewPageEvent: (target) => target.type() === 'page',
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

export class PuppeteerBrowserAgent extends PageAgent<PuppeteerWebPage> {
  private readonly pageController: BrowserAgentPageController<
    PuppeteerPage,
    PuppeteerTarget
  >;

  protected isRetryableContextError(error: unknown): boolean {
    return isRetryableBrowserNavigationError(error);
  }

  constructor(
    browser: PuppeteerBrowser,
    initialPage: PuppeteerPage,
    opts?: PuppeteerBrowserAgentOpt,
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

    const {
      autoFollowNewPage = false,
      newPageTimeout = 5000,
      ...agentOpts
    } = opts ?? {};
    const { forceChromeSelectRendering } = agentOpts;
    const pageControllerRef: {
      current?: BrowserAgentPageController<PuppeteerPage, PuppeteerTarget>;
    } = {};
    const getPageController = () => {
      if (!pageControllerRef.current) {
        throw new Error(
          '[midscene] PuppeteerBrowserAgent page controller is not initialized.',
        );
      }
      return pageControllerRef.current;
    };
    const browserActions = createBrowserAgentPageActions({
      agentName: 'PuppeteerBrowserAgent',
      getPageController,
    });
    const webPage = new PuppeteerWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: false,
      customActions: appendBrowserAgentPageActions(
        agentOpts.customActions,
        browserActions,
      ),
    });
    super(webPage, agentOpts);

    const pageController = new BrowserAgentPageController({
      agentName: 'PuppeteerBrowserAgent',
      adapter: createPuppeteerBrowserAdapter(browser),
      getActivePage: () => this.interface.underlyingPage as PuppeteerPage,
      setActivePageValue: (page) => {
        this.interface.underlyingPage = page;
      },
      autoFollowNewPage,
      newPageTimeout,
      debug,
    });
    pageControllerRef.current = pageController;
    this.pageController = pageController;

    applyForceChromeSelectRendering(
      initialPage,
      'puppeteer',
      forceChromeSelectRendering,
    );
  }

  static async create(
    browser: PuppeteerBrowser,
    opts?: PuppeteerBrowserAgentCreateOpt,
  ) {
    const { initialPage, ...agentOpts } = opts ?? {};
    const page =
      initialPage ?? (await browser.pages())[0] ?? (await browser.newPage());

    return new PuppeteerBrowserAgent(browser, page, agentOpts);
  }

  get activePage() {
    return this.pageController.activePage;
  }

  pages() {
    return this.pageController.pages();
  }

  async newPage() {
    return this.pageController.newPage();
  }

  async setActivePage(page: PuppeteerPage) {
    await this.pageController.setActivePage(page);
  }

  async waitForNewPage(
    action?: () => Promise<unknown> | unknown,
    opts?: { timeout?: number },
  ) {
    return this.pageController.waitForNewPage(action, opts);
  }

  async destroy() {
    this.pageController.destroy();
    await super.destroy();
  }
}
