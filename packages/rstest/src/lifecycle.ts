import { getDebug } from '@midscene/shared/logger';
import { afterAll, afterEach, beforeAll, beforeEach } from '@rstest/core';
import {
  type AgentLike,
  ReportHelper,
  type RstestTestContext,
  buildReportMeta,
} from './report-helper';

const debug = getDebug('rstest:lifecycle', { console: true });

interface SuiteContext {
  filepath: string;
}

export interface ReportMeta {
  groupName: string;
  reportFileName: string;
}

interface TestFixture<TAgent extends AgentLike, TPage> {
  agent: TAgent;
  page: TPage;
  /** Runs before `agent.destroy()` — use for tasks that need the page alive (e.g. stop trace). */
  teardown?: (testCtx: RstestTestContext) => Promise<void>;
}

export interface LifecycleProvider<
  TAgent extends AgentLike,
  TPage,
  TBrowser,
  TOptions,
> {
  launchBrowser(options: TOptions): Promise<TBrowser>;
  closeBrowser(browser: TBrowser): Promise<void>;
  createAgent(
    browser: TBrowser,
    url: string,
    options: TOptions,
    meta: ReportMeta,
  ): Promise<TestFixture<TAgent, TPage>>;
}

export interface LifecycleContext<TAgent extends AgentLike, TPage, TBrowser> {
  readonly agent: TAgent;
  readonly page: TPage;
  readonly browser: TBrowser;
  /**
   * Build and track a secondary agent for the current test (e.g. for a popup
   * or a second tab). The factory receives a unique `ReportMeta` so the
   * secondary's report is merged alongside the primary's. Destroy + report
   * collection happen automatically in `afterEach`.
   */
  spawnSecondaryAgent<T extends AgentLike>(build: (meta: ReportMeta) => T): T;
}

/**
 * Registers the per-suite lifecycle. `.agent` / `.page` are only valid inside
 * `it(...)`; `.browser` is valid between `beforeAll` and `afterAll`.
 */
export function registerLifecycle<
  TAgent extends AgentLike,
  TPage,
  TBrowser,
  TOptions,
>(
  url: string,
  options: TOptions,
  provider: LifecycleProvider<TAgent, TPage, TBrowser, TOptions>,
): LifecycleContext<TAgent, TPage, TBrowser> {
  const reportHelper = new ReportHelper();
  let browser: TBrowser | null = null;
  let filepath = '';
  let currentFixture: TestFixture<TAgent, TPage> | null = null;
  let currentMeta: ReportMeta | null = null;
  const secondaryAgents: AgentLike[] = [];
  let secondaryCounter = 0;
  let startTime = 0;

  beforeAll(async (suite: SuiteContext) => {
    filepath = suite.filepath;
    reportHelper.reset();
    browser = await provider.launchBrowser(options);
  });

  beforeEach(async (testCtx) => {
    if (!browser) throw new Error('[@midscene/rstest] browser not initialized');
    currentMeta = buildReportMeta(testCtx as RstestTestContext, filepath);
    secondaryCounter = 0;
    currentFixture = await provider.createAgent(
      browser,
      url,
      options,
      currentMeta,
    );
    startTime = performance.now();
  });

  afterEach(async (testCtx) => {
    const fixture = currentFixture;
    const secondaries = secondaryAgents.slice();
    currentFixture = null;
    currentMeta = null;
    secondaryAgents.length = 0;
    secondaryCounter = 0;

    // Collect secondaries first so their pages are still alive when destroy()
    // writes their report file.
    for (const secondary of secondaries) {
      try {
        await reportHelper.collectReport(
          secondary,
          startTime,
          testCtx as RstestTestContext,
        );
      } catch (err) {
        debug('secondary agent report failed:', err);
      }
    }

    if (fixture?.teardown) {
      try {
        await fixture.teardown(testCtx as RstestTestContext);
      } catch (err) {
        debug('provider teardown failed:', err);
      }
    }

    await reportHelper.collectReport(
      fixture?.agent,
      fixture ? startTime : undefined,
      testCtx as RstestTestContext,
    );
  });

  afterAll(async (suite: SuiteContext) => {
    reportHelper.mergeReports(suite.filepath);
    if (browser) {
      await provider.closeBrowser(browser);
      browser = null;
    }
  });

  function requireFixture<K extends 'agent' | 'page'>(
    field: K,
  ): TestFixture<TAgent, TPage>[K] {
    if (!currentFixture) {
      throw new Error(
        `[@midscene/rstest] ${field} is only available inside \`it(...)\` blocks`,
      );
    }
    return currentFixture[field];
  }

  return {
    get agent() {
      return requireFixture('agent');
    },
    get page() {
      return requireFixture('page');
    },
    get browser(): TBrowser {
      if (!browser) {
        throw new Error(
          '[@midscene/rstest] browser is only available between `beforeAll` and `afterAll`',
        );
      }
      return browser;
    },
    spawnSecondaryAgent<T extends AgentLike>(
      build: (meta: ReportMeta) => T,
    ): T {
      if (!currentMeta) {
        throw new Error(
          '[@midscene/rstest] secondary agents can only be spawned inside `it(...)` blocks',
        );
      }
      const idx = ++secondaryCounter;
      const agent = build({
        groupName: currentMeta.groupName,
        reportFileName: `${currentMeta.reportFileName}-page${idx}`,
      });
      secondaryAgents.push(agent);
      return agent;
    },
  };
}
