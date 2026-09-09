import { describe, expect, it } from '@rstest/core';
import type { Page } from 'playwright';
import {
  createPlaywrightNodes,
  gotoUrlInputSchema,
} from '../../src/playwright/test-runner';

describe('Playwright test runner entry', () => {
  it('creates Nodes without initializing a browser or loading the test runner', () => {
    let pageRequested = false;
    const nodes = createPlaywrightNodes({
      getPage: () => {
        pageRequested = true;
        throw new Error('A page is only available during execution.');
      },
    });
    expect(nodes.map(({ name }) => name)).toEqual([
      'gotoUrl',
      'setCookies',
      'clearCookies',
      'setViewportSize',
    ]);
    expect(pageRequested).toBe(false);
    expect(
      gotoUrlInputSchema.parse({ url: 'https://example.com' }).waitUntil,
    ).toBe('domcontentloaded');
  });

  it('rejects missing page providers', () => {
    expect(() => createPlaywrightNodes({} as never)).toThrow(
      'requires getPage()',
    );
  });

  it('honors cancellation before requesting a page', async () => {
    const context = { page: {} as Page };
    let pageRequested = false;
    const nodes = createPlaywrightNodes<typeof context>({
      getPage: (ctx) => {
        expect(ctx.context).toBe(context);
        pageRequested = true;
        return ctx.context.page;
      },
    });
    const controller = new AbortController();
    controller.abort(new Error('Run cancelled'));
    await expect(
      nodes[0].execute({
        context,
        signal: controller.signal,
        input: gotoUrlInputSchema.parse({ url: 'https://example.com' }),
      }),
    ).rejects.toThrow('Run cancelled');
    expect(pageRequested).toBe(false);
  });
});
