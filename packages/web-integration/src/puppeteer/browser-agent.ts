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
  private readonly browser: PuppeteerBrowser;
  private readonly autoFollowNewPage: boolean;
  private readonly newPageTimeout: number;

  private readonly targetCreatedHandler = (target: PuppeteerTarget) => {
    void this.followTarget(target);
  };

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
    const webPage = new PuppeteerWebPage(initialPage, {
      ...agentOpts,
      forceSameTabNavigation: false,
    });
    super(webPage, agentOpts);

    this.browser = browser;
    this.autoFollowNewPage = autoFollowNewPage;
    this.newPageTimeout = newPageTimeout;

    if (this.autoFollowNewPage) {
      this.browser.on('targetcreated', this.targetCreatedHandler);
    }

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
    return this.interface.underlyingPage as PuppeteerPage;
  }

  async pages() {
    return this.browser.pages();
  }

  async newPage() {
    const page = await this.browser.newPage();
    await this.setActivePage(page);
    return page;
  }

  async setActivePage(page: PuppeteerPage) {
    if (!page || page.isClosed()) {
      throw new Error(
        '[midscene] Cannot set PuppeteerBrowserAgent active page to a closed or invalid page.',
      );
    }

    this.interface.underlyingPage = page;
    try {
      await page.bringToFront();
    } catch (error) {
      debug(`failed to bring page to front: ${error}`);
    }
  }

  async waitForNewPage(
    action?: () => Promise<unknown> | unknown,
    opts?: { timeout?: number },
  ) {
    const waiter = this.createNewPageWaiter(opts?.timeout);

    try {
      await action?.();
      return await waiter.promise;
    } catch (error) {
      waiter.dispose();
      throw error;
    }
  }

  async destroy() {
    this.browser.off('targetcreated', this.targetCreatedHandler);
    await super.destroy();
  }

  private async followTarget(target: PuppeteerTarget) {
    if (target.type() !== 'page') {
      return;
    }

    try {
      const page = await target.page();
      if (page) {
        await this.setActivePage(page);
      }
    } catch (error) {
      debug(`failed to follow new page: ${error}`);
    }
  }

  private createNewPageWaiter(timeout = this.newPageTimeout) {
    let settled = false;

    const dispose = () => {
      this.browser.off('targetcreated', handler);
      clearTimeout(timer);
    };

    const handler = async (target: PuppeteerTarget) => {
      if (target.type() !== 'page' || settled) {
        return;
      }

      settled = true;
      dispose();

      try {
        const page = await target.page();
        if (!page) {
          throw new Error('new target did not resolve to a page');
        }
        resolvePage(page);
      } catch (error) {
        rejectPage(error);
      }
    };

    let resolvePage!: (page: PuppeteerPage) => void;
    let rejectPage!: (error: unknown) => void;
    const promise = new Promise<PuppeteerPage>((resolve, reject) => {
      resolvePage = resolve;
      rejectPage = reject;
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      rejectPage(
        new Error(
          `[midscene] Timed out waiting for a new Puppeteer page after ${timeout}ms.`,
        ),
      );
    }, timeout);

    this.browser.on('targetcreated', handler);

    return { promise, dispose };
  }
}
