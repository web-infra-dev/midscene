import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createPlaywrightNodes } from '../src/playwright';
import { collected, createPage, step } from './playwright-node-helpers';

describe('Playwright clearCookies Node', () => {
  it('clears cookies matching the configured filters', async () => {
    const { browserContext, page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );
    const result = await runCollectedCase(
      collected([step('clearCookies', { domain: '.example.com' })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(browserContext.clearCookies).toHaveBeenCalledWith({
      domain: '.example.com',
    });
  });
});
