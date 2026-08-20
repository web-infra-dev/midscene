import { PuppeteerPageOwnership } from '@/puppeteer/page-ownership';
import type { Browser, Page, Target } from 'puppeteer';
import { describe, expect, it, vi } from 'vitest';

const createBrowserHarness = () => {
  const targetCreatedHandlers = new Set<(target: Target) => void>();
  const closeOrder: string[] = [];
  const browser = {
    on: vi.fn((_event: string, handler: (target: Target) => void) => {
      targetCreatedHandlers.add(handler);
    }),
    off: vi.fn((_event: string, handler: (target: Target) => void) => {
      targetCreatedHandlers.delete(handler);
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
      close: vi.fn(async () => {
        closed = true;
        closeOrder.push(name);
      }),
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
});
