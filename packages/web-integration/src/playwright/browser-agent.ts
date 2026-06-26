import {
  type BrowserAgentAdapter,
  BrowserAgentPageController,
  BrowserAwareAgent,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import {
  applyForceChromeSelectRendering,
  isRetryableBrowserNavigationError,
} from '@/common/web-agent';
import type { WebPageAgentOpt } from '@/web-element';
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

export class PlaywrightBrowserAgent extends BrowserAwareAgent<
  PlaywrightWebPage,
  PlaywrightPage,
  PlaywrightPage
> {
  private get pageController(): BrowserAgentPageController<
    PlaywrightPage,
    PlaywrightPage
  > {
    return this.getPageController();
  }

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

    const { autoFollowNewPage, newPageTimeout, ...agentOpts } = opts ?? {};
    const runtimeOptions = resolveBrowserAgentRuntimeOptions({
      agentName: 'PlaywrightBrowserAgent',
      pageScope: 'browser',
      forceSameTabNavigation: (opts as WebPageAgentOpt | undefined)
        ?.forceSameTabNavigation,
      autoFollowNewPage,
      newPageTimeout,
    });
    const { forceChromeSelectRendering } = agentOpts;
    const webPage = new PlaywrightWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: runtimeOptions.forceSameTabNavigation,
    });
    const pageController = new BrowserAgentPageController({
      agentName: 'PlaywrightBrowserAgent',
      adapter: createPlaywrightBrowserAdapter(context),
      getActivePage: () => webPage.underlyingPage as PlaywrightPage,
      setActivePageValue: (page) => {
        webPage.underlyingPage = page;
      },
      autoFollowNewPage: runtimeOptions.autoFollowNewPage,
      newPageTimeout: runtimeOptions.newPageTimeout,
      debug,
    });
    super(webPage, agentOpts, pageController);

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
    await super.destroy();
  }
}
