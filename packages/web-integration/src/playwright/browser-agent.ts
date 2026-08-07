import {
  type BrowserAgentAdapter,
  BrowserPageManager,
  WebAgentCore,
  appendBrowserAgentPageActions,
  createBrowserAgentPageActions,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
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
  pageTitle: (page) => page.title(),
  pageUrl: (page) => page.url(),
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

export class PlaywrightBrowserAgent extends WebAgentCore<PlaywrightWebPage> {
  private readonly pageManager: BrowserPageManager<
    PlaywrightPage,
    PlaywrightPage
  >;

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
    const pageManagerRef: {
      current?: BrowserPageManager<PlaywrightPage, PlaywrightPage>;
    } = {};
    const getPageManager = () => {
      if (!pageManagerRef.current) {
        throw new Error(
          '[midscene] PlaywrightBrowserAgent page manager is not initialized.',
        );
      }
      return pageManagerRef.current;
    };
    const browserActions = createBrowserAgentPageActions({
      agentName: 'PlaywrightBrowserAgent',
      getPageManager,
    });
    const webPage = new PlaywrightWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: runtimeOptions.forceSameTabNavigation,
      customActions: appendBrowserAgentPageActions(
        agentOpts.customActions,
        browserActions,
      ),
    });
    const pageManager = new BrowserPageManager({
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
    pageManagerRef.current = pageManager;
    super(webPage, agentOpts);
    this.pageManager = pageManager;

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
    return this.pageManager.activePage;
  }

  pages() {
    return this.pageManager.pages();
  }

  async newPage() {
    return this.pageManager.newPage();
  }

  async setActivePage(page: PlaywrightPage) {
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
