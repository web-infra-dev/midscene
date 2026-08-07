import {
  BrowserPageManager,
  appendBrowserAgentPageActions,
  createBrowserAgentPageActions,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { describe, expect, it, vi } from 'vitest';

type PageMock = {
  id: string;
  title: string;
  url: string;
  closed?: boolean;
  bringToFront: ReturnType<typeof vi.fn>;
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
  bringToFront: vi.fn(),
});

function createManager(options?: {
  autoFollowNewPage?: boolean;
  newPage?: PageMock;
  pages?: PageMock[];
  activePage?: PageMock;
}) {
  let activePage =
    options?.activePage ?? options?.pages?.[0] ?? createPage('initial');
  const handlers = new Set<(event: NewPageEvent) => void>();
  const debug = vi.fn();
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
      pageTitle: (page) => page.title,
      pageUrl: (page) => page.url,
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
      agentName: 'TestBrowserAgent',
      getPageManager: () => ctx.manager,
    });

    expect(actions.map((action) => action.name)).toEqual([
      'ListBrowserPages',
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
      `ListBrowserPages returned the following open pages. Use a 0-based index with SetActivePage when selecting a page:\n${JSON.stringify(summaries, null, 2)}`,
    );

    await actions[1].call({ index: 1 }, {} as any);
    expect(ctx.activePage).toBe(docs);
  });

  it('keeps custom actions ahead of browser page actions', () => {
    const customAction = {
      name: 'SetActivePage',
      description: 'custom action',
      call: vi.fn(),
    };
    const browserActions = createBrowserAgentPageActions({
      agentName: 'TestBrowserAgent',
      getPageManager: () => createManager().manager,
    });

    const actions = appendBrowserAgentPageActions(
      [customAction],
      browserActions,
    );

    expect(actions.map((action) => action.name)).toEqual([
      'SetActivePage',
      'ListBrowserPages',
    ]);
    expect(actions[0]).toBe(customAction);
  });

  it('auto-follows matching new page events', async () => {
    const ctx = createManager({ autoFollowNewPage: true });
    const nextPage = createPage('next');

    ctx.emit({ kind: 'worker' });
    expect(ctx.activePage.id).toBe('initial');

    ctx.emit({ kind: 'page', page: nextPage });
    await vi.waitFor(() => expect(ctx.activePage).toBe(nextPage));
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
