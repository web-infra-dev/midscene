import { PuppeteerPageOwnership } from '@/puppeteer/page-ownership';
import { createScopedPuppeteerBrowserAgent } from '@/puppeteer/scoped-browser-agent';
import { describe, expect, it, rs } from '@rstest/core';
import type { Browser, Page, Target } from 'puppeteer';

const createBrowserHarness = () => {
  const targetCreatedHandlers = new Set<(target: Target) => void>();
  const closeOrder: string[] = [];
  let nextNewPage: Page | undefined;
  const browser = {
    on: rs.fn((_event: string, handler: (target: Target) => void) => {
      targetCreatedHandlers.add(handler);
    }),
    off: rs.fn((_event: string, handler: (target: Target) => void) => {
      targetCreatedHandlers.delete(handler);
    }),
    newPage: rs.fn(async () => {
      if (!nextNewPage) {
        throw new Error('No page queued for browser.newPage()');
      }
      const page = nextNewPage;
      nextNewPage = undefined;
      return page;
    }),
  } as unknown as Browser;

  const createPageTarget = (name: string, opener?: Target) => {
    let closed = false;
    const page = {} as Page;
    const target = {
      type: () => 'page',
      opener: () => opener,
      page: async () => page,
    } as unknown as Target;
    Object.assign(page, {
      browser: () => browser,
      target: () => target,
      isClosed: () => closed,
      close: rs.fn(async () => {
        closed = true;
        closeOrder.push(name);
      }),
      bringToFront: rs.fn().mockResolvedValue(undefined),
      evaluate: rs.fn().mockResolvedValue(undefined),
    });
    return { page, target };
  };

  return {
    browser,
    closeOrder,
    createPageTarget,
    emitTargetCreated: (target: Target) => {
      for (const handler of targetCreatedHandlers) {
        handler(target);
      }
    },
    queueNewPage: (page: Page) => {
      nextNewPage = page;
    },
    targetCreatedHandlers,
  };
};

describe('PuppeteerPageOwnership', () => {
  it('accepts only targets opened from its own page tree', () => {
    const harness = createBrowserHarness();
    const firstRoot = harness.createPageTarget('first-root');
    const secondRoot = harness.createPageTarget('second-root');
    const firstOwnership = new PuppeteerPageOwnership(firstRoot.page);
    const secondOwnership = new PuppeteerPageOwnership(secondRoot.page);
    const firstPopup = harness.createPageTarget(
      'first-popup',
      firstRoot.target,
    );

    harness.emitTargetCreated(firstPopup.target);

    expect(firstOwnership.captureTarget(firstPopup.target)).toBe(true);
    expect(secondOwnership.captureTarget(firstPopup.target)).toBe(false);
  });

  it('closes owned descendants before the initial page and releases its listener', async () => {
    const harness = createBrowserHarness();
    const root = harness.createPageTarget('root');
    const ownership = new PuppeteerPageOwnership(root.page);
    const child = harness.createPageTarget('child', root.target);
    const unrelatedRoot = harness.createPageTarget('unrelated-root');
    const unrelatedChild = harness.createPageTarget(
      'unrelated-child',
      unrelatedRoot.target,
    );

    harness.emitTargetCreated(child.target);
    harness.emitTargetCreated(unrelatedChild.target);
    await ownership.close();

    expect(harness.closeOrder).toEqual(['child', 'root']);
    expect(harness.targetCreatedHandlers.size).toBe(0);
  });

  it('keeps BrowserAgent page enumeration and activation inside its scope', async () => {
    const harness = createBrowserHarness();
    const firstRoot = harness.createPageTarget('first-root');
    const secondRoot = harness.createPageTarget('second-root');
    const ownership = new PuppeteerPageOwnership(firstRoot.page);
    const ownedNewPage = harness.createPageTarget('owned-new-page');
    const agent = createScopedPuppeteerBrowserAgent(
      harness.browser,
      firstRoot.page,
      { forceChromeSelectRendering: false },
      ownership,
    );

    await expect(agent.pages()).resolves.toEqual([firstRoot.page]);
    await expect(agent.setActivePage(secondRoot.page)).rejects.toThrow(
      'out-of-scope page',
    );
    expect(ownership.ownsPage(secondRoot.page)).toBe(false);

    harness.queueNewPage(ownedNewPage.page);
    await expect(agent.newPage()).resolves.toBe(ownedNewPage.page);
    await expect(agent.pages()).resolves.toEqual([
      firstRoot.page,
      ownedNewPage.page,
    ]);
    expect(agent.activePage).toBe(ownedNewPage.page);

    ownership.release();
  });
});
