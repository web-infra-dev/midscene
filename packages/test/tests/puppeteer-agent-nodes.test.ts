import { createRequire } from 'node:module';
import type * as PuppeteerAgents from '@midscene/web/puppeteer';
import {
  clearCookiesInputSchema,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '@midscene/web/puppeteer/test';
import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createMidsceneNodes } from '../src/midscene';
import { collected, createPage, step } from './puppeteer-node-helpers';

const { PuppeteerAgent, PuppeteerBrowserAgent } = createRequire(
  import.meta.url,
)('@midscene/web/puppeteer') as typeof PuppeteerAgents;

describe('Puppeteer Agent Node registration', () => {
  it('exports the Puppeteer input schemas', () => {
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

  for (const agentClass of [PuppeteerAgent, PuppeteerBrowserAgent]) {
    it(`registers and executes browser Nodes through ${agentClass.name}`, async () => {
      const { page, pageMock, browserContext } = createPage();
      const agent = Object.assign(Object.create(agentClass.prototype), {
        interface: { underlyingPage: page },
        addDumpUpdateListener: undefined,
        testRunner: {
          baseURL: 'https://example.com',
          getCookieProfile: ({ profile }: { profile: string }) => {
            expect(profile).toBe('login');
            return [
              {
                name: 'session',
                value: 'secret',
                domain: 'example.com',
                path: '/',
              },
            ];
          },
        },
      });
      const nodes = createMidsceneNodes({ agentClass, getAgent: () => agent });
      const names = nodes.map(({ name }) => name);
      expect(names).toEqual(
        expect.arrayContaining([
          'aiAct',
          'aiTap',
          'wait',
          'gotoUrl',
          'setCookies',
          'clearCookies',
          'setViewportSize',
        ]),
      );
      expect(new Set(names).size).toBe(names.length);

      const registry = new NodeRegistry(nodes);
      const result = await runCollectedCase(
        collected([
          step('setCookies', { profile: 'login' }),
          step('gotoUrl', { url: '/chat' }),
          step('setViewportSize', { width: 1440, height: 900 }),
          step('clearCookies', { name: 'session' }),
        ]),
        { resolveNode: registry.require.bind(registry), context: undefined },
      );

      expect(result.status).toBe('success');
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(pageMock.setCookie).toHaveBeenCalled();
      expect(pageMock.goto).toHaveBeenCalledWith(
        'https://example.com/chat',
        expect.any(Object),
      );
      expect(pageMock.setViewport).toHaveBeenCalledWith({
        width: 1440,
        height: 900,
      });
      expect(browserContext.deleteCookie).toHaveBeenCalledOnce();
    });
  }
});
