import { createRequire } from 'node:module';
import type * as PlaywrightAgents from '@midscene/web/playwright/agent';
import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createMidsceneNodes } from '../src/midscene';
import { collected, createPage, step } from './playwright-node-helpers';

const { PlaywrightAgent, PlaywrightBrowserAgent } = createRequire(
  import.meta.url,
)('@midscene/web/playwright/agent') as typeof PlaywrightAgents;

describe('Playwright Agent Node registration', () => {
  for (const agentClass of [PlaywrightAgent, PlaywrightBrowserAgent]) {
    it(`registers and executes browser Nodes through ${agentClass.name}`, async () => {
      const { page, pageMock } = createPage();
      const agent = Object.assign(Object.create(agentClass.prototype), {
        interface: { underlyingPage: page },
        // No report listener is needed for this browser-only fixture.
        addDumpUpdateListener: undefined,
        testRunner: {
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
        ]),
        { resolveNode: registry.require.bind(registry), context: undefined },
      );
      expect(result.status).toBe('success');
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(page.context().addCookies).toHaveBeenCalled();
      expect(pageMock.goto).toHaveBeenCalledWith(
        'https://example.com/chat',
        expect.any(Object),
      );
      expect(pageMock.setViewportSize).toHaveBeenCalledWith({
        width: 1440,
        height: 900,
      });

      const next = createPage();
      agent.interface.underlyingPage = next.page;
      const nextResult = await runCollectedCase(
        collected([step('clearCookies', {})]),
        { resolveNode: registry.require.bind(registry), context: undefined },
      );
      expect(nextResult.status).toBe('success');
      expect(next.browserContext.clearCookies).toHaveBeenCalled();
    });
  }
});
