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

describe('Playwright setViewportSize Node', () => {
  it('sets and returns the effective viewport', async () => {
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
      createMidsceneNodes({
        agentClass: PlaywrightAgent,
        getAgent: () => ({
          ...createMockMidsceneAgent(),
          interface: { underlyingPage: page },
        }),
      }),
    );
    const result = await runCollectedCase(
      collected([step('setViewportSize', { width: 0, height: 900 })]),
      { resolveNode: registry.require.bind(registry), context: undefined },
    );

    expect(result.steps[0].error?.code).toBe('NODE_INPUT_VALIDATION_ERROR');
  });
});
