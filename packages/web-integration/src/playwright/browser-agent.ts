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
  private readonly context: PlaywrightBrowserContext;
  private readonly autoFollowNewPage: boolean;
  private readonly newPageTimeout: number;

  private readonly pageHandler = (page: PlaywrightPage) => {
    void this.followPage(page);
  };

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

    this.context = context;
    this.autoFollowNewPage = autoFollowNewPage;
    this.newPageTimeout = newPageTimeout;

    if (this.autoFollowNewPage) {
      this.context.on('page', this.pageHandler);
    }

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
    return this.interface.underlyingPage as PlaywrightPage;
  }

  pages() {
    return this.context.pages();
  }

  async newPage() {
    const page = await this.context.newPage();
    await this.setActivePage(page);
    return page;
  }

  async setActivePage(page: PlaywrightPage) {
    if (!page || page.isClosed()) {
      throw new Error(
        '[midscene] Cannot set PlaywrightBrowserAgent active page to a closed or invalid page.',
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
    this.context.off('page', this.pageHandler);
    await super.destroy();
  }

  private async followPage(page: PlaywrightPage) {
    try {
      await this.setActivePage(page);
    } catch (error) {
      debug(`failed to follow new page: ${error}`);
    }
  }

  private createNewPageWaiter(timeout = this.newPageTimeout) {
    let settled = false;

    const dispose = () => {
      this.context.off('page', handler);
      clearTimeout(timer);
    };

    const handler = (page: PlaywrightPage) => {
      if (settled) {
        return;
      }

      settled = true;
      dispose();
      resolvePage(page);
    };

    let resolvePage!: (page: PlaywrightPage) => void;
    let rejectPage!: (error: unknown) => void;
    const promise = new Promise<PlaywrightPage>((resolve, reject) => {
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
          `[midscene] Timed out waiting for a new Playwright page after ${timeout}ms.`,
        ),
      );
    }, timeout);

    this.context.on('page', handler);

    return { promise, dispose };
  }
}
