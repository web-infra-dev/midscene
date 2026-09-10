import { createRequire } from 'node:module';
import { createMidsceneNodes } from '../src/midscene';
import { createMockMidsceneAgent } from './mock-midscene-agent';
const { PlaywrightAgent } = createRequire(import.meta.url)(
  '@midscene/web/playwright/agent',
);
import {
  clearCookiesInputSchema,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '@midscene/web/playwright/test';
import { describe, expect, it } from 'vitest';
import { createPage } from './playwright-node-helpers';

describe('PlaywrightAgent Nodes', () => {
  it('registers common and Playwright Nodes and exports input schemas', () => {
    const { page } = createPage();
    const nodes = createMidsceneNodes({
      agentClass: PlaywrightAgent,
      getAgent: () => ({
        ...createMockMidsceneAgent(),
        interface: { underlyingPage: page },
      }),
    });
    expect(nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining([
        'aiAct',
        'wait',
        'gotoUrl',
        'setCookies',
        'clearCookies',
        'setViewportSize',
      ]),
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
