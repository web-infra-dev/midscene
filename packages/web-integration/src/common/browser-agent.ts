import type { DeviceAction } from '@midscene/core';
import type { DebugFunction } from '@midscene/shared/logger';
import { z } from 'zod';

export type BrowserAgentAdapter<Page, NewPageEvent> = {
  pages(): Page[] | Promise<Page[]>;
  newPage(): Promise<Page>;
  isPageClosed(page: Page): boolean;
  bringToFront(page: Page): Promise<void> | void;
  pageTitle(page: Page): Promise<string> | string;
  pageUrl(page: Page): string;
  onNewPage(handler: (event: NewPageEvent) => void): void;
  offNewPage(handler: (event: NewPageEvent) => void): void;
  resolveNewPage(event: NewPageEvent): Page | Promise<Page | null> | null;
  isNewPageEvent?: (event: NewPageEvent) => boolean;
};

export type BrowserAgentPageControllerOptions<Page, NewPageEvent> = {
  agentName: string;
  adapter: BrowserAgentAdapter<Page, NewPageEvent>;
  getActivePage(): Page;
  setActivePageValue(page: Page): void;
  autoFollowNewPage: boolean;
  newPageTimeout: number;
  debug: DebugFunction;
};

export type BrowserAgentPageSummary = {
  index: number;
  active: boolean;
  title: string;
  url: string;
};

const setActivePageParamSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('0-based page/tab index returned by ListBrowserPages.'),
  title: z
    .string()
    .optional()
    .describe('Case-insensitive page title substring to match.'),
  url: z
    .string()
    .optional()
    .describe('Case-insensitive page URL substring to match.'),
});

export type SetActivePageParam = z.infer<typeof setActivePageParamSchema>;

const normalizeOptionalText = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

const describeSelector = (selector: SetActivePageParam) => {
  const parts: string[] = [];
  if (selector.index !== undefined) {
    parts.push(`index ${selector.index}`);
  }
  if (selector.title?.trim()) {
    parts.push(`title "${selector.title.trim()}"`);
  }
  if (selector.url?.trim()) {
    parts.push(`url "${selector.url.trim()}"`);
  }
  return parts.join(', ');
};

export class BrowserAgentPageController<Page, NewPageEvent> {
  private readonly agentName: string;
  private readonly adapter: BrowserAgentAdapter<Page, NewPageEvent>;
  private readonly getActivePageValue: () => Page;
  private readonly setActivePageValue: (page: Page) => void;
  private readonly newPageTimeout: number;
  private readonly debug: DebugFunction;

  private readonly newPageHandler = (event: NewPageEvent) => {
    void this.followNewPage(event);
  };

  constructor(options: BrowserAgentPageControllerOptions<Page, NewPageEvent>) {
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

  async pageSummaries(): Promise<BrowserAgentPageSummary[]> {
    const pages = await this.adapter.pages();
    const activePage = this.activePage;

    return Promise.all(
      pages.map((page, index) =>
        this.pageSummary(page, index, page === activePage),
      ),
    );
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

  async setActivePageBySelector(
    selector: SetActivePageParam,
  ): Promise<BrowserAgentPageSummary> {
    const hasIndex = selector.index !== undefined;
    const title = normalizeOptionalText(selector.title);
    const url = normalizeOptionalText(selector.url);

    if (!hasIndex && !title && !url) {
      throw new Error(
        `[midscene] SetActivePage requires index, title, or url for ${this.agentName}.`,
      );
    }

    const pages = await this.adapter.pages();

    if (hasIndex) {
      const page = pages[selector.index as number];
      if (!page || this.adapter.isPageClosed(page)) {
        throw new Error(
          `[midscene] Cannot find ${this.agentName} page with index ${selector.index}. Available page indexes: ${pages
            .map((_, index) => index)
            .join(', ')}`,
        );
      }

      await this.setActivePage(page);
      return this.pageSummary(page, selector.index as number, true);
    }

    const matchedPages: Array<{ page: Page; index: number }> = [];
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      if (this.adapter.isPageClosed(page)) {
        continue;
      }

      const summary = await this.pageSummary(page, index, false);
      const matchedTitle =
        !title || summary.title.toLowerCase().includes(title);
      const matchedUrl = !url || summary.url.toLowerCase().includes(url);
      if (matchedTitle && matchedUrl) {
        matchedPages.push({ page, index });
      }
    }

    if (matchedPages.length === 0) {
      throw new Error(
        `[midscene] Cannot find ${this.agentName} page matching ${describeSelector(selector)}.`,
      );
    }

    if (matchedPages.length > 1) {
      throw new Error(
        `[midscene] Multiple ${this.agentName} pages matched ${describeSelector(selector)}. Use ListBrowserPages and pass an index to SetActivePage.`,
      );
    }

    const { page, index } = matchedPages[0];
    await this.setActivePage(page);
    return this.pageSummary(page, index, true);
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

  private async pageSummary(
    page: Page,
    index: number,
    active: boolean,
  ): Promise<BrowserAgentPageSummary> {
    let title = '';
    let url = '';

    try {
      title = await this.adapter.pageTitle(page);
    } catch (error) {
      this.debug(`failed to read page title: ${error}`);
    }

    try {
      url = this.adapter.pageUrl(page);
    } catch (error) {
      this.debug(`failed to read page url: ${error}`);
    }

    return {
      index,
      active,
      title,
      url,
    };
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

export const createBrowserAgentPageActions = <Page, NewPageEvent>(options: {
  agentName: string;
  getPageController: () => BrowserAgentPageController<Page, NewPageEvent>;
}): DeviceAction<any>[] => [
  {
    name: 'ListBrowserPages',
    description:
      'List all open browser pages/tabs and show which one is currently active. Use this before switching pages when a task refers to another tab or window.',
    call: async () => options.getPageController().pageSummaries(),
  },
  {
    name: 'SetActivePage',
    description:
      'Set the active browser page/tab by 0-based index, title substring, or URL substring. Use index from ListBrowserPages when more than one page could match.',
    paramSchema: setActivePageParamSchema,
    sample: {
      index: 1,
    },
    call: async (param) =>
      options.getPageController().setActivePageBySelector(param),
  },
];

export const appendBrowserAgentPageActions = (
  customActions: DeviceAction<any>[] | undefined,
  browserActions: DeviceAction<any>[],
) => {
  if (!customActions?.length) {
    return browserActions;
  }

  const customActionNames = new Set(customActions.map((action) => action.name));
  return [
    ...customActions,
    ...browserActions.filter((action) => !customActionNames.has(action.name)),
  ];
};
