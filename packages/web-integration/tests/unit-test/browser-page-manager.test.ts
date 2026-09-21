import {
  BrowserPageManager,
  resolveBrowserAgentRuntimeOptions,
} from '@/common/browser-agent';
import { describe, expect, it, rs } from '@rstest/core';

type PageMock = {
  id: string;
  closed?: boolean;
  bringToFront: ReturnType<typeof rs.fn>;
};

type NewPageEvent = {
  kind: 'page' | 'worker';
  page?: PageMock | null;
};

const createPage = (id: string): PageMock => ({
  id,
  bringToFront: rs.fn(),
});

function createManager(options?: {
  autoFollowNewPage?: boolean;
  newPage?: PageMock;
}) {
  let activePage = createPage('initial');
  const handlers = new Set<(event: NewPageEvent) => void>();
  const debug = rs.fn();
  const newPage = options?.newPage ?? createPage('created');

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
      pages: () => [activePage],
      newPage: async () => newPage,
      isPageClosed: (page) => Boolean(page.closed),
      bringToFront: (page) => page.bringToFront(),
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
