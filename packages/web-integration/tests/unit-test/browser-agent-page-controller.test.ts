import { BrowserAgentPageController } from '@/common/browser-agent';
import { describe, expect, it, vi } from 'vitest';

type PageMock = {
  id: string;
  closed?: boolean;
  bringToFront: ReturnType<typeof vi.fn>;
};

type NewPageEvent = {
  kind: 'page' | 'worker';
  page?: PageMock | null;
};

const createPage = (id: string): PageMock => ({
  id,
  bringToFront: vi.fn(),
});

function createController(options?: {
  autoFollowNewPage?: boolean;
  newPage?: PageMock;
}) {
  let activePage = createPage('initial');
  const handlers = new Set<(event: NewPageEvent) => void>();
  const debug = vi.fn();
  const newPage = options?.newPage ?? createPage('created');

  const controller = new BrowserAgentPageController<PageMock, NewPageEvent>({
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
    controller,
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

describe('BrowserAgentPageController', () => {
  it('sets the created page as active page', async () => {
    const ctx = createController();

    const page = await ctx.controller.newPage();

    expect(page.id).toBe('created');
    expect(ctx.activePage).toBe(page);
    expect(page.bringToFront).toHaveBeenCalledTimes(1);
  });

  it('auto-follows matching new page events', async () => {
    const ctx = createController({ autoFollowNewPage: true });
    const nextPage = createPage('next');

    ctx.emit({ kind: 'worker' });
    expect(ctx.activePage.id).toBe('initial');

    ctx.emit({ kind: 'page', page: nextPage });
    await vi.waitFor(() => expect(ctx.activePage).toBe(nextPage));
    expect(nextPage.bringToFront).toHaveBeenCalledTimes(1);
  });

  it('waits for the next page without switching active page', async () => {
    const ctx = createController();
    const nextPage = createPage('next');

    const waiting = ctx.controller.waitForNewPage();
    ctx.emit({ kind: 'worker' });
    ctx.emit({ kind: 'page', page: nextPage });

    await expect(waiting).resolves.toBe(nextPage);
    expect(ctx.activePage.id).toBe('initial');
  });

  it('removes the auto-follow listener on destroy', () => {
    const ctx = createController({ autoFollowNewPage: true });

    expect(ctx.handlers.size).toBe(1);
    ctx.controller.destroy();
    expect(ctx.handlers.size).toBe(0);
  });

  it('rejects closed pages', async () => {
    const ctx = createController();
    const closedPage = createPage('closed');
    closedPage.closed = true;

    await expect(ctx.controller.setActivePage(closedPage)).rejects.toThrow(
      '[midscene] Cannot set TestBrowserAgent active page to a closed or invalid page.',
    );
  });
});
