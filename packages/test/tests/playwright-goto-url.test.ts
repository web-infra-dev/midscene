import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createPlaywrightNodes } from '../src/playwright';
import { collected, createPage, step } from './playwright-node-helpers';

describe('Playwright gotoUrl Node', () => {
  it('navigates relative URLs and returns the main-resource status', async () => {
    const { page, pageMock } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({
        getPage: () => page,
        getBaseUrl: () => 'https://example.com/root/',
      }),
    );

    const success = await runCollectedCase(
      collected([step('gotoUrl', { prompt: '/orders' })]),
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

  it('rejects relative navigation without baseUrl', async () => {
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );
    const result = await runCollectedCase(
      collected([step('gotoUrl', { url: '/relative' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );
    expect(result.steps[0].error?.message).toContain('must be an absolute URL');
  });
});
