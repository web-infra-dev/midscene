import {
  type BrowserPageManager,
  WebAgentCore,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { applyForceChromeSelectRendering } from '@/common/browser-agent-utils';
import {
  BrowserPageManagerSlot,
  appendBrowserAgentPageActions,
  createBrowserAgentPageActions,
} from '@/common/browser-page-actions';
import type { WebPageAgentOpt } from '@/web-element';
import { getDebug } from '@midscene/shared/logger';
import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
  Target as PuppeteerTarget,
} from 'puppeteer';
import { createPuppeteerBrowserPageManager } from './browser-page-manager';
import { PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:browser-agent');

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
  private readonly pageManagerSlot: BrowserPageManagerSlot<
    PuppeteerPage,
    PuppeteerTarget
  >;

  protected get pageManager() {
    return this.pageManagerSlot.requireCurrent();
  }

  protected set pageManager(pageManager: BrowserPageManager<
    PuppeteerPage,
    PuppeteerTarget
  >) {
    this.replacePageManager(pageManager);
  }

  protected replacePageManager(
    pageManager: BrowserPageManager<PuppeteerPage, PuppeteerTarget>,
  ) {
    this.pageManagerSlot.replace(pageManager);
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
    const pageManagerSlot = new BrowserPageManagerSlot<
      PuppeteerPage,
      PuppeteerTarget
    >('PuppeteerBrowserAgent');
    const browserActions = createBrowserAgentPageActions({
      agentName: 'PuppeteerBrowserAgent',
      getPageManager: () => pageManagerSlot.requireCurrent(),
    });
    const webPage = new PuppeteerWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: runtimeOptions.forceSameTabNavigation,
      customActions: appendBrowserAgentPageActions(
        agentOpts.customActions,
        browserActions,
      ),
    });
    const pageManager = createPuppeteerBrowserPageManager({
      browser,
      webPage,
      runtimeOptions,
      debug,
    });
    pageManagerSlot.initialize(pageManager);
    super(webPage, agentOpts);
    this.pageManagerSlot = pageManagerSlot;

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
    return this.pageManager.activePage;
  }

  pages() {
    return this.pageManager.pages();
  }

  async newPage() {
    return this.pageManager.newPage();
  }

  async setActivePage(page: PuppeteerPage) {
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
