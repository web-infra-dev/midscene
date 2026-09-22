import {
  BrowserPageManager,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import {
  appendBrowserAgentPageActions,
  createBrowserAgentPageActions,
} from '@/common/browser-page-actions';
import { describe, expect, it, rs } from '@rstest/core';

type PageMock = {
  id: string;
  title: string;
  url: string;
  closed?: boolean;
  bringToFront: ReturnType<typeof rs.fn>;
};

type NewPageEvent = {
  kind: 'page' | 'worker';
  page?: PageMock | null;
};

const createPage = (
  id: string,
  options?: {
    title?: string;
    url?: string;
  },
): PageMock => ({
  id,
  title: options?.title ?? id,
  url: options?.url ?? `https://example.com/${id}`,
  bringToFront: rs.fn(),
});

function createManager(options?: {
  autoFollowNewPage?: boolean;
  newPage?: PageMock;
  pages?: PageMock[];
  activePage?: PageMock;
  pageTitle?: (page: PageMock) => string | Promise<string>;
  pageUrl?: (page: PageMock) => string;
}) {
  let activePage =
    options?.activePage ?? options?.pages?.[0] ?? createPage('initial');
  const handlers = new Set<(event: NewPageEvent) => void>();
  const debug = rs.fn();
  const newPage = options?.newPage ?? createPage('created');
  const pages = options?.pages ?? [activePage];

  const manager = new BrowserPageManager<PageMock, NewPageEvent>({
    agentName: 'TestBrowserAgent',
    autoFollowNewPage: options?.autoFollowNewPage ?? false,
    newPageTimeout: 50,
    debug,
    getActivePage: () => activePage,
    setActivePageValue: (page) => {
      activePage = page;
    },
    adapter: {
      pages: () => pages,
      newPage: async () => {
        pages.push(newPage);
        return newPage;
      },
      isPageClosed: (page) => Boolean(page.closed),
      bringToFront: (page) => page.bringToFront(),
      pageTitle: options?.pageTitle ?? ((page) => page.title),
      pageUrl: options?.pageUrl ?? ((page) => page.url),
      onNewPage: (handler) => {
        handlers.add(handler);
      },
      offNewPage: (handler) => {
        handlers.delete(handler);
      },
      isNewPageEvent: (event) => event.kind === 'page',
      resolveNewPage: (event) => event.page ?? null,
    },
  });

  return {
    manager,
    get activePage() {
      return activePage;
    },
    emit: (event: NewPageEvent) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
    handlers,
    debug,
    newPage,
  };
}

describe('BrowserPageManager', () => {
  it('sets the created page as active page', async () => {
    const ctx = createManager();

    const page = await ctx.manager.newPage();

    expect(page.id).toBe('created');
    expect(ctx.activePage).toBe(page);
    expect(page.bringToFront).toHaveBeenCalledTimes(1);
  });

  it('lists browser pages with the active page marker', async () => {
    const initial = createPage('initial', {
      title: 'Home',
      url: 'https://example.com/home',
    });
    const docs = createPage('docs', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    const ctx = createManager({
      pages: [initial, docs],
      activePage: docs,
    });

    await expect(ctx.manager.pageSummaries()).resolves.toEqual([
      {
        index: 0,
        active: false,
        title: 'Home',
        url: 'https://example.com/home',
      },
      {
        index: 1,
        active: true,
        title: 'Docs',
        url: 'https://example.com/docs',
      },
    ]);
  });

  it('reports page metadata failures instead of returning blank values', async () => {
    const ctx = createManager({
      pageTitle: () => {
        throw new Error('title unavailable');
      },
    });

    await expect(ctx.manager.pageSummaries()).rejects.toThrow(
      'title unavailable',
    );
  });

  it('skips a page that closes while its title is being read', async () => {
    const closing = createPage('closing');
    const docs = createPage('docs', { title: 'Docs' });
    const ctx = createManager({
      pages: [closing, docs],
      pageTitle: async (page) => {
        if (page === closing) {
          closing.closed = true;
          throw new Error('page closed');
        }
        return page.title;
      },
    });

    await expect(ctx.manager.pageSummaries()).resolves.toEqual([
      {
        index: 0,
        active: false,
        title: 'Docs',
        url: 'https://example.com/docs',
      },
    ]);
    await expect(
      ctx.manager.setActivePageBySelector({ title: 'docs' }),
    ).resolves.toMatchObject({ title: 'Docs', active: true });

    const closingDuringSelection = createPage('closing');
    const selectorCtx = createManager({
      pages: [closingDuringSelection, docs],
      pageTitle: async (page) => {
        if (page === closingDuringSelection) {
          closingDuringSelection.closed = true;
          throw new Error('page closed');
        }
        return page.title;
      },
    });
    await expect(
      selectorCtx.manager.setActivePageBySelector({ title: 'docs' }),
    ).resolves.toMatchObject({ title: 'Docs', active: true });
  });

  it('reports when a page closes while its details are being read', async () => {
    const closing = createPage('closing');
    const ctx = createManager({
      pages: [closing],
      pageTitle: async (page) => {
        page.closed = true;
        throw new Error('page closed');
      },
    });

    await expect(ctx.manager.pageSummaryByIndex(0)).rejects.toThrow(
      'page at index 0 closed while reading its metadata. Run ListBrowserPages again.',
    );
  });

  it('sets the active page by selector', async () => {
    const initial = createPage('initial', {
      title: 'Home',
      url: 'https://example.com/home',
    });
    const docs = createPage('docs', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    const ctx = createManager({ pages: [initial, docs] });

    const summary = await ctx.manager.setActivePageBySelector({
      title: 'docs',
    });

    expect(ctx.activePage).toBe(docs);
    expect(summary).toEqual({
      index: 1,
      active: true,
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    expect(docs.bringToFront).toHaveBeenCalledTimes(1);
  });

  it('validates title and url when they accompany an index selector', async () => {
    const initial = createPage('initial', {
      title: 'Home',
      url: 'https://example.com/home',
    });
    const docs = createPage('docs', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    const ctx = createManager({ pages: [initial, docs] });

    await expect(
      ctx.manager.setActivePageBySelector({
        index: 1,
        title: 'docs',
        url: '/docs',
      }),
    ).resolves.toMatchObject({ index: 1, title: 'Docs' });

    await expect(
      ctx.manager.setActivePageBySelector({ index: 0, title: 'Docs' }),
    ).rejects.toThrow(
      '[midscene] TestBrowserAgent page at index 0 does not match title "Docs". Run ListBrowserPages again before selecting a page.',
    );
    expect(ctx.activePage).toBe(docs);
    expect(initial.bringToFront).not.toHaveBeenCalled();
  });

  it('rejects ambiguous title or url selectors', async () => {
    const first = createPage('first', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    const second = createPage('second', {
      title: 'API Docs',
      url: 'https://example.com/api',
    });
    const ctx = createManager({ pages: [first, second] });

    await expect(
      ctx.manager.setActivePageBySelector({ title: 'docs' }),
    ).rejects.toThrow(
      '[midscene] Multiple TestBrowserAgent pages matched title "docs". Use ListBrowserPages and pass an index to SetActivePage.',
    );
  });

  it('creates browser page actions for AI page selection', async () => {
    const initial = createPage('initial', {
      title: 'Home',
      url: 'https://example.com/home',
    });
    const docs = createPage('docs', {
      title: 'Docs',
      url: 'https://example.com/docs',
    });
    const ctx = createManager({ pages: [initial, docs] });
    const actions = createBrowserAgentPageActions({
      getPageManager: () => ctx.manager,
    });

    expect(actions.map((action) => action.name)).toEqual([
      'ListBrowserPages',
      'GetBrowserPageInfo',
      'SetActivePage',
    ]);
    const taskContext = { task: {} } as any;
    const summaries = await actions[0].call(undefined, taskContext);
    expect(summaries).toEqual([
      {
        index: 0,
        active: true,
        title: 'Home',
        url: 'https://example.com/home',
      },
      {
        index: 1,
        active: false,
        title: 'Docs',
        url: 'https://example.com/docs',
      },
    ]);
    expect(taskContext.task.planningFeedback).toBe(
      'ListBrowserPages 0-1 of 2; active 0 (0-based). Use SetActivePage.\n*0|Home|https://example.com/home\n 1|Docs|https://example.com/docs',
    );
    expect(taskContext.task.planningFeedbackMaxLength).toBe(8192);

    await actions[2].call({ index: 1 }, {} as any);
    expect(ctx.activePage).toBe(docs);
  });

  it('keeps distinguishing page details when pages share long prefixes', async () => {
    const pages = Array.from({ length: 8 }, (_, index) =>
      createPage(`page-${index}`, {
        title: `${'shared title '.repeat(20)}unique-title-${index}`,
        url: `https://example.com/${'shared-path/'.repeat(50)}unique-url-${index}`,
      }),
    );
    const ctx = createManager({ pages, activePage: pages[2] });
    const actions = createBrowserAgentPageActions({
      getPageManager: () => ctx.manager,
    });
    const taskContext = { task: {} } as any;

    await actions[0].call(undefined, taskContext);

    const feedback = taskContext.task.planningFeedback as string;
    for (const [index] of pages.entries()) {
      const marker = index === 2 ? '*' : ' ';
      expect(feedback).toContain(`${marker}${index}|`);
      expect(feedback).toContain(`unique-title-${index}`);
      expect(feedback).toContain(`unique-url-${index}`);
    }
    expect(feedback.length).toBeGreaterThan(500);
    expect(taskContext.task.planningFeedbackMaxLength).toBe(8192);
  });

  it('returns full page info without switching pages and forwards useful details', async () => {
    const initial = createPage('initial');
    const fullTitle = `${'title '.repeat(30)}unique-title-tail`;
    const fullUrl = `https://example.com/${'long-path/'.repeat(60)}unique-url-tail`;
    const details = createPage('details', {
      title: fullTitle,
      url: fullUrl,
    });
    const ctx = createManager({ pages: [initial, details] });
    const actions = createBrowserAgentPageActions({
      getPageManager: () => ctx.manager,
    });
    const taskContext = { task: {} } as any;

    await expect(actions[1].call({ index: 1 }, taskContext)).resolves.toEqual({
      index: 1,
      active: false,
      title: fullTitle,
      url: fullUrl,
    });
    expect(ctx.activePage).toBe(initial);
    expect(taskContext.task.planningFeedback).toContain('unique-title-tail');
    expect(taskContext.task.planningFeedback).toContain('unique-url-tail');
    expect(taskContext.task.planningFeedbackMaxLength).toBe(
      taskContext.task.planningFeedback.length,
    );
  });

  it('forwards an extreme URL without truncating planning feedback', async () => {
    const longUrl = `https://example.com/${'x'.repeat(5000)}unique-url-tail`;
    const page = createPage('long-url', { url: longUrl });
    const ctx = createManager({ pages: [page] });
    const actions = createBrowserAgentPageActions({
      getPageManager: () => ctx.manager,
    });
    const taskContext = { task: {} } as any;

    const summary = await actions[1].call({ index: 0 }, taskContext);
    expect(summary.url).toBe(longUrl);
    expect(taskContext.task.planningFeedback).toContain(`URL: ${longUrl}`);
    expect(taskContext.task.planningFeedbackMaxLength).toBe(
      taskContext.task.planningFeedback.length,
    );
  });

  it('paginates large page lists without losing page identities', async () => {
    const pages = Array.from({ length: 100 }, (_, index) =>
      createPage(`page-${index}`),
    );
    const ctx = createManager({ pages, activePage: pages[99] });
    const actions = createBrowserAgentPageActions({
      getPageManager: () => ctx.manager,
    });
    const taskContext = { task: {} } as any;

    const firstPage = await actions[0].call(undefined, taskContext);
    expect(firstPage).toHaveLength(8);
    expect(taskContext.task.planningFeedback).toContain(
      'Next: ListBrowserPages({offset:8})',
    );
    expect(taskContext.task.planningFeedback).toContain(' 7|page-7|');
    expect(taskContext.task.planningFeedbackMaxLength).toBe(8192);

    const lastPage = await actions[0].call({ offset: 96 }, taskContext);
    expect(lastPage.map(({ index }: { index: number }) => index)).toEqual([
      96, 97, 98, 99,
    ]);
    expect(taskContext.task.planningFeedback).toContain('*99|page-99|');
    expect(taskContext.task.planningFeedbackMaxLength).toBe(8192);

    await expect(actions[0].call({ offset: 100 }, taskContext)).rejects.toThrow(
      'offset 100 is out of range',
    );
  });

  it('keeps custom actions ahead of browser page actions', () => {
    const customAction = {
      name: 'SetActivePage',
      description: 'custom action',
      call: rs.fn(),
    };
    const browserActions = createBrowserAgentPageActions({
      getPageManager: () => createManager().manager,
    });

    const actions = appendBrowserAgentPageActions(
      [customAction],
      browserActions,
    );

    expect(actions.map((action) => action.name)).toEqual([
      'SetActivePage',
      'ListBrowserPages',
      'GetBrowserPageInfo',
    ]);
    expect(actions[0]).toBe(customAction);
  });

  it('auto-follows matching new page events', async () => {
    const ctx = createManager({ autoFollowNewPage: true });
    const nextPage = createPage('next');

    ctx.emit({ kind: 'worker' });
    expect(ctx.activePage.id).toBe('initial');

    ctx.emit({ kind: 'page', page: nextPage });
    await rs.waitFor(() => expect(ctx.activePage).toBe(nextPage));
    expect(nextPage.bringToFront).toHaveBeenCalledTimes(1);
  });

  it('waits for the next page without switching active page', async () => {
    const ctx = createManager();
    const nextPage = createPage('next');

    const waiting = ctx.manager.waitForNewPage();
    ctx.emit({ kind: 'worker' });
    ctx.emit({ kind: 'page', page: nextPage });

    await expect(waiting).resolves.toBe(nextPage);
    expect(ctx.activePage.id).toBe('initial');
  });

  it('removes the auto-follow listener on destroy', () => {
    const ctx = createManager({ autoFollowNewPage: true });

    expect(ctx.handlers.size).toBe(1);
    ctx.manager.destroy();
    expect(ctx.handlers.size).toBe(0);
  });

  it('rejects closed pages', async () => {
    const ctx = createManager();
    const closedPage = createPage('closed');
    closedPage.closed = true;

    await expect(ctx.manager.setActivePage(closedPage)).rejects.toThrow(
      '[midscene] Cannot set TestBrowserAgent active page to a closed or invalid page.',
    );
  });
});

describe('resolveBrowserAgentRuntimeOptions', () => {
  it('keeps page mode locked by default', () => {
    expect(
      resolveBrowserAgentRuntimeOptions({
        agentName: 'TestPageAgent',
        pageScope: 'page',
      }),
    ).toEqual({
      pageScope: 'page',
      forceSameTabNavigation: true,
      autoFollowNewPage: false,
      newPageTimeout: 5000,
    });
  });

  it('keeps browser mode browser-controlled by default', () => {
    expect(
      resolveBrowserAgentRuntimeOptions({
        agentName: 'TestBrowserAgent',
        pageScope: 'browser',
      }),
    ).toEqual({
      pageScope: 'browser',
      forceSameTabNavigation: false,
      autoFollowNewPage: false,
      newPageTimeout: 5000,
    });
  });

  it('rejects auto-follow in page mode', () => {
    expect(() =>
      resolveBrowserAgentRuntimeOptions({
        agentName: 'TestPageAgent',
        pageScope: 'page',
        autoFollowNewPage: true,
      }),
    ).toThrow('autoFollowNewPage requires browser mode');
  });

  it('rejects same-tab forcing in browser mode', () => {
    expect(() =>
      resolveBrowserAgentRuntimeOptions({
        agentName: 'TestBrowserAgent',
        pageScope: 'browser',
        forceSameTabNavigation: false,
      }),
    ).toThrow('forceSameTabNavigation cannot be used in browser mode');
  });
});
