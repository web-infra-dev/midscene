import { describe, expect, it, vi } from 'vitest';

const agentInstances: Array<{ opts: any }> = [];

vi.mock('@/playwright/index', () => {
  class MockPlaywrightAgent {
    opts: any;

    reportFile?: string;

    constructor(_page: any, opts: any) {
      this.opts = opts;
      agentInstances.push(this);
    }

    waitForNetworkIdle = vi.fn();

    destroy = vi.fn(async () => undefined);
  }

  return {
    PlaywrightAgent: MockPlaywrightAgent,
  };
});

import { PlaywrightAiFixture } from '@/playwright/ai-fixture';

const createMockPage = () => ({
  on: vi.fn(),
});

const createTestInfo = () =>
  ({
    testId: 'playwright-fixture-test-id',
    titlePath: ['fixture.spec.ts', 'forwards options'],
    retry: 0,
    annotations: [],
  }) as any;

describe('PlaywrightAiFixture option forwarding', () => {
  it('forwards agent options configured at fixture level', async () => {
    agentInstances.length = 0;
    const fixture = PlaywrightAiFixture({
      replanningCycleLimit: 9,
      waitAfterAction: 120,
      aiActContext: 'fixture-level-context',
      useDeviceTimestamp: true,
    });

    const page = createMockPage();
    await fixture.agentForPage(
      { page } as any,
      async (getAgent: any) => {
        await getAgent();
      },
      createTestInfo(),
    );

    expect(agentInstances).toHaveLength(1);
    expect(agentInstances[0].opts.replanningCycleLimit).toBe(9);
    expect(agentInstances[0].opts.waitAfterAction).toBe(120);
    expect(agentInstances[0].opts.aiActContext).toBe('fixture-level-context');
    expect(agentInstances[0].opts.useDeviceTimestamp).toBe(true);
  });

  it('allows per-call options to override fixture-level options', async () => {
    agentInstances.length = 0;
    const fixture = PlaywrightAiFixture({
      replanningCycleLimit: 9,
      waitAfterAction: 120,
    });

    const page = createMockPage();
    await fixture.agentForPage(
      { page } as any,
      async (getAgent: any) => {
        await getAgent(undefined, {
          replanningCycleLimit: 3,
          waitAfterAction: 60,
        });
      },
      createTestInfo(),
    );

    expect(agentInstances).toHaveLength(1);
    expect(agentInstances[0].opts.replanningCycleLimit).toBe(3);
    expect(agentInstances[0].opts.waitAfterAction).toBe(60);
  });
});
