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

export interface AgentBundle<TAgent extends AgentLike> {
  agent: TAgent;
  /** Runs before `agent.destroy()` — use for tasks that need the page alive (e.g. stop trace). */
  teardown?: (testCtx: RstestTestContext) => Promise<void>;
}

export interface LifecycleProvider<
  TAgent extends AgentLike,
  TBrowser,
  TOptions,
> {
  launchBrowser(options: TOptions): Promise<TBrowser>;
  closeBrowser(browser: TBrowser): Promise<void>;
  createAgent(
    browser: TBrowser,
    url: string,
    options: TOptions,
    meta: { groupName: string; reportFileName: string },
  ): Promise<AgentBundle<TAgent>>;
}

/** Returned `.agent` is only valid inside `it(...)` — it's created in `beforeEach`. */
export function registerLifecycle<TAgent extends AgentLike, TBrowser, TOptions>(
  url: string,
  options: TOptions,
  provider: LifecycleProvider<TAgent, TBrowser, TOptions>,
): { readonly agent: TAgent } {
  const reportHelper = new ReportHelper();
  let browser: TBrowser | null = null;
  let filepath = '';
  let currentBundle: AgentBundle<TAgent> | null = null;
  let startTime = 0;

  beforeAll(async (suite: SuiteContext) => {
    filepath = suite.filepath;
    reportHelper.reset();
    browser = await provider.launchBrowser(options);
  });

  beforeEach(async (testCtx) => {
    if (!browser) throw new Error('[@midscene/rstest] browser not initialized');
    const meta = buildReportMeta(testCtx as RstestTestContext, filepath);
    currentBundle = await provider.createAgent(browser, url, options, meta);
    startTime = performance.now();
  });

  afterEach(async (testCtx) => {
    const bundle = currentBundle;
    currentBundle = null;

    if (bundle?.teardown) {
      try {
        await bundle.teardown(testCtx as RstestTestContext);
      } catch (err) {
        debug('provider teardown failed:', err);
      }
    }

    await reportHelper.collectReport(
      bundle?.agent,
      bundle ? startTime : undefined,
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

  return {
    get agent(): TAgent {
      if (!currentBundle) {
        throw new Error(
          '[@midscene/rstest] agent is only available inside `it(...)` blocks',
        );
      }
      return currentBundle.agent;
    },
  };
}
