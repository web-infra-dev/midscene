import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  ctorOpts: [] as any[],
  instances: [] as any[],
}));

vi.mock('@/playwright/index', () => {
  class MockPlaywrightAgent {
    reportFile?: string;

    constructor(_page: any, opts: any) {
      mockState.ctorOpts.push(opts);
      mockState.instances.push(this);
      this.reportFile = opts?.generateReport ? 'mock-report.html' : undefined;
    }

    async destroy() {}
  }

  return {
    PlaywrightAgent: MockPlaywrightAgent,
  };
});

import { PlaywrightAiFixture } from '@/playwright/ai-fixture';

describe('PlaywrightAiFixture option forwarding', () => {
  beforeEach(() => {
    mockState.ctorOpts.length = 0;
    mockState.instances.length = 0;
  });

  const createPage = () =>
    ({
      on: vi.fn(),
    }) as any;

  const createTestInfo = () =>
    ({
      testId: 'test-id',
      titlePath: ['fixture.spec.ts', 'forwards options'],
      annotations: [],
      retry: 0,
    }) as any;

  it('should forward fixture-level AgentOpt and WebPageOpt to the first agent creation', async () => {
    const fixture = PlaywrightAiFixture({
      autoPrintReportMsg: false,
      outputFormat: 'html-and-external-assets',
      waitAfterAction: 120,
      enableTouchEventsInActionSpace: true,
      forceChromeSelectRendering: true,
    });

    await fixture.ai({ page: createPage() }, async () => {}, createTestInfo());

    expect(mockState.ctorOpts).toHaveLength(1);
    expect(mockState.ctorOpts[0]).toMatchObject({
      autoPrintReportMsg: false,
      outputFormat: 'html-and-external-assets',
      waitAfterAction: 120,
      enableTouchEventsInActionSpace: true,
      forceChromeSelectRendering: true,
      generateReport: true,
    });
  });

  it('should allow the first agentForPage call to override fixture defaults', async () => {
    const fixture = PlaywrightAiFixture({
      autoPrintReportMsg: true,
      waitAfterAction: 300,
      enableTouchEventsInActionSpace: true,
    });

    let getAgentForPage: any;
    await fixture.agentForPage(
      { page: createPage() },
      async (agentForPage: any) => {
        getAgentForPage = agentForPage;
      },
      createTestInfo(),
    );

    await getAgentForPage(createPage(), {
      autoPrintReportMsg: false,
      waitAfterAction: 50,
      enableTouchEventsInActionSpace: false,
    });

    expect(mockState.ctorOpts).toHaveLength(1);
    expect(mockState.ctorOpts[0]).toMatchObject({
      autoPrintReportMsg: false,
      waitAfterAction: 50,
      enableTouchEventsInActionSpace: false,
    });
  });

  it('should reuse the existing agent instead of recreating it with later overrides', async () => {
    const page = createPage();
    const fixture = PlaywrightAiFixture({
      autoPrintReportMsg: true,
    });

    let getAgentForPage: any;
    await fixture.agentForPage(
      { page },
      async (agentForPage: any) => {
        getAgentForPage = agentForPage;
      },
      createTestInfo(),
    );

    const firstAgent = await getAgentForPage(page, {
      autoPrintReportMsg: false,
    });
    const secondAgent = await getAgentForPage(page, {
      autoPrintReportMsg: true,
    });

    expect(firstAgent).toBe(secondAgent);
    expect(mockState.ctorOpts).toHaveLength(1);
    expect(mockState.ctorOpts[0]).toMatchObject({
      autoPrintReportMsg: false,
    });
  });
});
