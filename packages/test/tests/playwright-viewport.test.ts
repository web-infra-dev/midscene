import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../src';
import { runCollectedCase } from '../src/engine/run-collected-case';
import { createPlaywrightNodes } from '../src/playwright';
import { collected, createPage, step } from './playwright-node-helpers';

describe('Playwright setViewportSize Node', () => {
  it('sets and returns the effective viewport', async () => {
    const { page, pageMock } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );
    const result = await runCollectedCase(
      collected([step('setViewportSize', { width: 1440, height: 900 })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.status).toBe('success');
    expect(pageMock.setViewportSize).toHaveBeenCalledWith({
      width: 1440,
      height: 900,
    });
    expect(result.steps[0].output?.data).toEqual({
      width: 1440,
      height: 900,
    });
  });

  it('rejects invalid viewport sizes', async () => {
    const { page } = createPage();
    const registry = new NodeRegistry(
      createPlaywrightNodes({ getPage: () => page }),
    );
    const result = await runCollectedCase(
      collected([step('setViewportSize', { width: 0, height: 900 })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.code).toBe('NODE_INPUT_VALIDATION_ERROR');
  });
});
