import { PlaywrightAgent, type WebPageAgentOpt } from '@midscene/web/playwright';
import { type Browser, type Page, chromium } from 'playwright';
import { ReportHelper, buildReportMeta } from '../report-helper';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext } from './base';

const DEFAULT_ARGS = ['--no-sandbox', '--ignore-certificate-errors'];

export interface WebTestOptions {
  viewport?: { width: number; height: number };
  headless?: boolean;
  /** Options passed to PlaywrightAgent (e.g. aiActionContext, modelConfig). */
  agentOptions?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>;
}

export class WebTest extends BaseTestContext<PlaywrightAgent> {
  private static sharedBrowser: Browser | null = null;
  private static sharedOptions: WebTestOptions = {};
  private static reportHelper = new ReportHelper();

  page: Page;

  private constructor(page: Page, agent: PlaywrightAgent) {
    super(agent);
    this.page = page;
  }

  protected async onDestroy(): Promise<void> {
    await this.page.close();
  }

  /**
   * Launch the shared Chromium browser. Called once in `beforeAll`.
   */
  static async launchBrowser(options?: WebTestOptions): Promise<void> {
    WebTest.sharedOptions = options ?? {};
    WebTest.sharedBrowser = await chromium.launch({
      headless: options?.headless ?? true,
      args: DEFAULT_ARGS,
    });
    WebTest.reportHelper.reset();
  }

  /**
   * Create a new page + agent on the shared browser.
   */
  static async create(
    targetUrl: string,
    testCtx: VitestTestContext,
    options?: WebTestOptions,
  ): Promise<WebTest> {
    if (!WebTest.sharedBrowser) {
      await WebTest.launchBrowser(options);
    }
    const opts = { ...WebTest.sharedOptions, ...options };
    const page = await WebTest.sharedBrowser!.newPage({
      viewport: opts.viewport ?? { width: 1920, height: 1080 },
    });
    await page.goto(targetUrl);

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new PlaywrightAgent(page, {
      ...opts.agentOptions,
      groupName,
      reportFileName,
    });
    return new WebTest(page, agent);
  }

  static async collectReport(
    ctx: WebTest | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      WebTest.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      WebTest.reportHelper,
      WebTest.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await WebTest.sharedBrowser?.close();
    WebTest.sharedBrowser = null;
  }

  /**
   * Register lifecycle hooks and return a context object whose `page` and
   * `agent` properties point to the current test's instances.
   *
   * Usage:
   * ```ts
   * describe('百度搜索', () => {
   *   const ctx = WebTest.setup('https://baidu.com');
   *
   *   it('搜索', async () => {
   *     await ctx.agent.aiAct('...');
   *     await ctx.page.waitForLoadState('networkidle');
   *   });
   * });
   * ```
   */
  static setup(targetUrl: string, options?: WebTestOptions) {
    let currentCtx: WebTest | undefined;

    beforeAll(() => WebTest.launchBrowser(options));
    beforeEach(async (testCtx) => {
      currentCtx = await WebTest.create(targetUrl, testCtx, options);
    });
    afterEach((testCtx) => {
      const ctx = currentCtx;
      currentCtx = undefined;
      return WebTest.collectReport(ctx, testCtx);
    });
    afterAll((suite) => WebTest.mergeAndTeardown(suite));

    return {
      get page() { return currentCtx!.page; },
      get agent() { return currentCtx!.agent; },
    } as { page: Page; agent: PlaywrightAgent };
  }
}
