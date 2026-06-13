import {
  type BrowserAgentAdapter,
  BrowserAgentPageController,
} from '@/common/browser-agent';
import {
  applyForceChromeSelectRendering,
  isRetryableBrowserNavigationError,
} from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
import { Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import type {
  BrowserContext as PlaywrightBrowserContext,
  Page as PlaywrightPage,
} from 'playwright';
import { WebPage as PlaywrightWebPage } from './page';

const debug = getDebug('playwright:browser-agent');

const createPlaywrightBrowserAdapter = (
  context: PlaywrightBrowserContext,
): BrowserAgentAdapter<PlaywrightPage, PlaywrightPage> => ({
  pages: () => context.pages(),
  newPage: () => context.newPage(),
  isPageClosed: (page) => page.isClosed(),
  bringToFront: (page) => page.bringToFront(),
  onNewPage: (handler) => context.on('page', handler),
  offNewPage: (handler) => context.off('page', handler),
  resolveNewPage: (page) => page,
});

export type PlaywrightBrowserAgentOpt = Omit<
  WebPageAgentOpt,
  'forceSameTabNavigation'
> & {
  autoFollowNewPage?: boolean;
  newPageTimeout?: number;
};

export type PlaywrightBrowserAgentCreateOpt = PlaywrightBrowserAgentOpt & {
  initialPage?: PlaywrightPage;
};

export class PlaywrightBrowserAgent extends PageAgent<PlaywrightWebPage> {
  private readonly pageController: BrowserAgentPageController<
    PlaywrightPage,
    PlaywrightPage
  >;

  protected isRetryableContextError(error: unknown): boolean {
    return isRetryableBrowserNavigationError(error);
  }

  constructor(
    context: PlaywrightBrowserContext,
    initialPage: PlaywrightPage,
    opts?: PlaywrightBrowserAgentOpt,
  ) {
    if (!context) {
      throw new Error(
        '[midscene] PlaywrightBrowserAgent requires a valid Playwright browser context.',
      );
    }
    if (!initialPage) {
      throw new Error(
        '[midscene] PlaywrightBrowserAgent requires a valid initial page instance.',
      );
    }

    const {
      autoFollowNewPage = false,
      newPageTimeout = 5000,
      ...agentOpts
    } = opts ?? {};
    const { forceChromeSelectRendering } = agentOpts;
    const webPage = new PlaywrightWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: false,
    });
    super(webPage, agentOpts);

    this.pageController = new BrowserAgentPageController({
      agentName: 'PlaywrightBrowserAgent',
      adapter: createPlaywrightBrowserAdapter(context),
      getActivePage: () => this.interface.underlyingPage as PlaywrightPage,
      setActivePageValue: (page) => {
        this.interface.underlyingPage = page;
      },
      autoFollowNewPage,
      newPageTimeout,
      debug,
    });

    applyForceChromeSelectRendering(
      initialPage,
      'playwright',
      forceChromeSelectRendering,
    );
  }

  static async create(
    context: PlaywrightBrowserContext,
    opts?: PlaywrightBrowserAgentCreateOpt,
  ) {
    const { initialPage, ...agentOpts } = opts ?? {};
    const page = initialPage ?? context.pages()[0] ?? (await context.newPage());

    return new PlaywrightBrowserAgent(context, page, agentOpts);
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

  async setActivePage(page: PlaywrightPage) {
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
