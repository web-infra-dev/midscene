import { createRequire } from 'node:module';
import { createMidsceneNodes } from '../src/midscene';
import { createMockMidsceneAgent } from './mock-midscene-agent';
const { PlaywrightAgent } = createRequire(import.meta.url)(
  '@midscene/web/playwright/agent',
);
import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';

import { collected, createPage, step } from './playwright-node-helpers';

describe('Playwright gotoUrl Node', () => {
  it('navigates relative URLs and returns the main-resource status', async () => {
    const { page, pageMock } = createPage();
    const registry = new NodeRegistry(
      createMidsceneNodes({
        agentClass: PlaywrightAgent,
        getAgent: () => ({
          ...createMockMidsceneAgent(),
          interface: { underlyingPage: page },
        }),
      }),
    );

    const success = await runCollectedCase(
      collected([step('gotoUrl', { url: '/orders' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(success.steps[0].output?.data).toEqual({
      url: 'https://example.com/final',
      status: 200,
      title: 'Example',
    });
    expect(pageMock.goto).toHaveBeenCalledWith('https://example.com/orders', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    for (const status of [404, 503]) {
      pageMock.goto.mockResolvedValueOnce({ status: () => status });
      const httpErrorPage = await runCollectedCase(
        collected([step('gotoUrl', { url: 'https://example.com/down' })]),
        { resolveNode: registry.require.bind(registry), context: undefined },
      );
      expect(httpErrorPage.status).toBe('success');
      expect(httpErrorPage.steps[0].output?.data).toEqual({
        url: 'https://example.com/final',
        status,
        title: 'Example',
      });
    }
  });

  it.each([
    [
      '/login',
      'https://example.com/orders/1',
      undefined,
      'https://example.com/login',
    ],
    [
      'login',
      'https://example.com/orders/1',
      undefined,
      'https://example.com/orders/login',
    ],
    [
      '../login',
      'https://example.com/orders/1',
      undefined,
      'https://example.com/login',
    ],
    [
      '?page=2',
      'https://example.com/orders/1',
      undefined,
      'https://example.com/orders/1?page=2',
    ],
    [
      '/login',
      'https://current.example/orders',
      'https://configured.example/root/',
      'https://configured.example/login',
    ],
    [
      'login',
      'about:blank',
      'https://configured.example/root/',
      'https://configured.example/root/login',
    ],
    [
      'https://other.example/login',
      'about:blank',
      undefined,
      'https://other.example/login',
    ],
    [
      'https://other.example/login',
      'about:blank',
      'invalid',
      'https://other.example/login',
    ],
  ])(
    'resolves %s from %s with configured base %s',
    async (url, currentUrl, baseURL, expected) => {
      const { page, pageMock, browserContext } = createPage();
      pageMock.url.mockReturnValue(currentUrl);
      Object.assign(browserContext, { _options: { baseURL } });
      const registry = new NodeRegistry(
        createMidsceneNodes({
          agentClass: PlaywrightAgent,
          getAgent: () => ({
            ...createMockMidsceneAgent(),
            interface: { underlyingPage: page },
          }),
        }),
      );
      const result = await runCollectedCase(
        collected([step('gotoUrl', { url })]),
        {
          resolveNode: registry.require.bind(registry),
          context: undefined,
        },
      );
      expect(result.status).toBe('success');
      expect(pageMock.goto).toHaveBeenCalledWith(expected, expect.any(Object));
    },
  );

  it.each(['about:blank', 'data:text/html,hello', 'file:///tmp/page.html'])(
    'rejects relative navigation from %s',
    async (currentUrl) => {
      const { page, pageMock } = createPage();
      pageMock.url.mockReturnValue(currentUrl);
      const registry = new NodeRegistry(
        createMidsceneNodes({
          agentClass: PlaywrightAgent,
          getAgent: () => ({
            ...createMockMidsceneAgent(),
            interface: { underlyingPage: page },
          }),
        }),
      );
      const result = await runCollectedCase(
        collected([step('gotoUrl', { url: '/relative' })]),
        {
          resolveNode: registry.require.bind(registry),
          context: undefined,
        },
      );
      expect(result.steps[0].error?.message).toContain(
        'Use an absolute HTTP(S) URL for the first navigation',
      );
      expect(pageMock.goto).not.toHaveBeenCalled();
    },
  );

  it.each(['javascript:alert(1)', 'data:text/html,hello', '   '])(
    'rejects invalid navigation %s',
    async (url) => {
      const { page, pageMock } = createPage();
      const registry = new NodeRegistry(
        createMidsceneNodes({
          agentClass: PlaywrightAgent,
          getAgent: () => ({
            ...createMockMidsceneAgent(),
            interface: { underlyingPage: page },
          }),
        }),
      );
      const result = await runCollectedCase(
        collected([step('gotoUrl', { url })]),
        {
          resolveNode: registry.require.bind(registry),
          context: undefined,
        },
      );
      expect(result.status).toBe('failed');
      expect(pageMock.goto).not.toHaveBeenCalled();
    },
  );
});
