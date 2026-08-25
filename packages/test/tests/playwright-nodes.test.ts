import { describe, expect, it } from 'vitest';
import {
  clearCookiesInputSchema,
  createPlaywrightNodes,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '../src/playwright';
import { createPage } from './playwright-node-helpers';

describe('createPlaywrightNodes', () => {
  it('registers the P0 Playwright nodes and validates factory options', () => {
    const { page } = createPage();
    const nodes = createPlaywrightNodes({ getPage: () => page });
    expect(nodes.map((node) => node.name)).toEqual([
      'gotoUrl',
      'setCookies',
      'clearCookies',
      'setViewportSize',
    ]);
    expect(() => createPlaywrightNodes({} as never)).toThrow(
      'createPlaywrightNodes() requires getPage()',
    );
    expect(gotoUrlInputSchema.parse({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
      waitUntil: 'domcontentloaded',
      timeoutMs: 60_000,
    });
    expect(setCookiesInputSchema.safeParse({ profile: 'member' }).success).toBe(
      true,
    );
    expect(clearCookiesInputSchema.parse({})).toEqual({});
    expect(
      setViewportSizeInputSchema.safeParse({ width: 800, height: 600 }).success,
    ).toBe(true);
  });
});
