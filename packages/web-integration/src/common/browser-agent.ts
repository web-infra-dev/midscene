import { Agent as CoreAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import type { DebugFunction } from '@midscene/shared/logger';
import { isRetryableBrowserNavigationError } from './web-agent';

export type BrowserAgentPageScope = 'page' | 'browser';

export type BrowserAgentAdapter<Page, NewPageEvent> = {
  pages(): Page[] | Promise<Page[]>;
  newPage(): Promise<Page>;
  isPageClosed(page: Page): boolean;
  bringToFront(page: Page): Promise<void> | void;
  onNewPage(handler: (event: NewPageEvent) => void): void;
  offNewPage(handler: (event: NewPageEvent) => void): void;
  resolveNewPage(event: NewPageEvent): Page | Promise<Page | null> | null;
  isNewPageEvent?: (event: NewPageEvent) => boolean;
};

export type BrowserPageManagerOptions<Page, NewPageEvent> = {
  agentName: string;
  adapter: BrowserAgentAdapter<Page, NewPageEvent>;
  getActivePage(): Page;
  setActivePageValue(page: Page): void;
  autoFollowNewPage: boolean;
  newPageTimeout: number;
  debug: DebugFunction;
};

export type BrowserAgentRuntimeOptions = {
  agentName: string;
  pageScope: BrowserAgentPageScope;
  forceSameTabNavigation?: boolean;
  autoFollowNewPage?: boolean;
  newPageTimeout?: number;
};

export type ResolvedBrowserAgentRuntimeOptions = {
  pageScope: BrowserAgentPageScope;
  forceSameTabNavigation: boolean;
  autoFollowNewPage: boolean;
  newPageTimeout: number;
};

export abstract class WebAgentCore<
  InterfaceType extends AbstractInterface,
> extends CoreAgent<InterfaceType> {
  protected isRetryableContextError(error: unknown): boolean {
    return isRetryableBrowserNavigationError(error);
  }
}

const DEFAULT_NEW_PAGE_TIMEOUT = 5000;

export function resolveBrowserAgentRuntimeOptions({
  agentName,
  pageScope,
  forceSameTabNavigation,
  autoFollowNewPage,
  newPageTimeout = DEFAULT_NEW_PAGE_TIMEOUT,
}: BrowserAgentRuntimeOptions): ResolvedBrowserAgentRuntimeOptions {
  if (pageScope === 'page') {
    if (autoFollowNewPage) {
      throw new Error(
        `[midscene] autoFollowNewPage requires browser mode for ${agentName}. Use BrowserAgent when one agent should follow newly opened pages.`,
      );
    }

    return {
      pageScope,
      forceSameTabNavigation: forceSameTabNavigation ?? true,
      autoFollowNewPage: false,
      newPageTimeout,
    };
  }

  if (typeof forceSameTabNavigation !== 'undefined') {
    throw new Error(
      `[midscene] forceSameTabNavigation cannot be used in browser mode for ${agentName}. Use PageAgent when same-tab navigation is required.`,
    );
  }

  return {
    pageScope,
    forceSameTabNavigation: false,
    autoFollowNewPage: autoFollowNewPage ?? false,
    newPageTimeout,
  };
}

export class BrowserPageManager<Page, NewPageEvent> {
  private readonly agentName: string;
  private readonly adapter: BrowserAgentAdapter<Page, NewPageEvent>;
  private readonly getActivePageValue: () => Page;
  private readonly setActivePageValue: (page: Page) => void;
  private readonly newPageTimeout: number;
  private readonly debug: DebugFunction;

  private readonly newPageHandler = (event: NewPageEvent) => {
    void this.followNewPage(event);
  };

  constructor(options: BrowserPageManagerOptions<Page, NewPageEvent>) {
    this.agentName = options.agentName;
    this.adapter = options.adapter;
    this.getActivePageValue = options.getActivePage;
    this.setActivePageValue = options.setActivePageValue;
    this.newPageTimeout = options.newPageTimeout;
    this.debug = options.debug;

    if (options.autoFollowNewPage) {
      this.adapter.onNewPage(this.newPageHandler);
    }
  }

  get activePage() {
    return this.getActivePageValue();
  }

  pages() {
    return this.adapter.pages();
  }

  async newPage() {
    const page = await this.adapter.newPage();
    await this.setActivePage(page);
    return page;
  }

  async setActivePage(page: Page) {
    if (!page || this.adapter.isPageClosed(page)) {
      throw new Error(
        `[midscene] Cannot set ${this.agentName} active page to a closed or invalid page.`,
      );
    }

    this.setActivePageValue(page);
    try {
      await this.adapter.bringToFront(page);
    } catch (error) {
      this.debug(`failed to bring page to front: ${error}`);
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

  destroy() {
    this.adapter.offNewPage(this.newPageHandler);
  }

  private async followNewPage(event: NewPageEvent) {
    if (!this.isNewPageEvent(event)) {
      return;
    }

    try {
      const page = await this.adapter.resolveNewPage(event);
      if (page) {
        await this.setActivePage(page);
      }
    } catch (error) {
      this.debug(`failed to follow new page: ${error}`);
    }
  }

  private isNewPageEvent(event: NewPageEvent) {
    return this.adapter.isNewPageEvent?.(event) ?? true;
  }

  private createNewPageWaiter(timeout = this.newPageTimeout) {
    let settled = false;

    const dispose = () => {
      this.adapter.offNewPage(handler);
      clearTimeout(timer);
    };

    const handler = async (event: NewPageEvent) => {
      if (settled || !this.isNewPageEvent(event)) {
        return;
      }

      settled = true;
      dispose();

      try {
        const page = await this.adapter.resolveNewPage(event);
        if (!page) {
          throw new Error('new target did not resolve to a page');
        }
        resolvePage(page);
      } catch (error) {
        rejectPage(error);
      }
    };

    let resolvePage!: (page: Page) => void;
    let rejectPage!: (error: unknown) => void;
    const promise = new Promise<Page>((resolve, reject) => {
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
          `[midscene] Timed out waiting for a new ${this.agentName} page after ${timeout}ms.`,
        ),
      );
    }, timeout);

    this.adapter.onNewPage(handler);

    return { promise, dispose };
  }
}
