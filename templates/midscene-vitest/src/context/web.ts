import { PlaywrightAgent, type WebPageAgentOpt } from '@midscene/web/playwright';
import { type Browser, type Page, chromium } from 'playwright';
import { ReportHelper, buildReportMeta } from '../report-helper';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext, type TestFixture } from './base';

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
   * Initialize the shared browser instance. Call once in `beforeAll`.
   */
  static async setup(options?: WebTestOptions): Promise<void> {
    WebTest.sharedOptions = options ?? {};
    WebTest.sharedBrowser = await chromium.launch({
      headless: options?.headless ?? true,
      args: DEFAULT_ARGS,
    });
    WebTest.reportHelper.reset();
  }

  /**
   * Create a new page + agent on the shared browser. Call in each `it` block.
   */
  static async create(
    targetUrl: string,
    testCtx: VitestTestContext,
    options?: WebTestOptions,
  ): Promise<WebTest> {
    if (!WebTest.sharedBrowser) {
      await WebTest.setup(options);
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
   * Register all lifecycle hooks (beforeAll / afterEach / afterAll) and return
   * an object with a `create` method for per-test contexts.
   *
   * Usage:
   * ```ts
   * const fixture = WebTest.init();
   * it('test', async (testCtx) => {
   *   const ctx = await fixture.create('https://example.com', testCtx);
   * });
   * ```
   */
  static init(options?: WebTestOptions): TestFixture<WebTest, [string, VitestTestContext, WebTestOptions?]> {
    let currentCtx: WebTest | undefined;

    beforeAll(() => WebTest.setup(options));
    afterEach((testCtx) =>
      WebTest.collectReport(currentCtx, testCtx),
    );
    afterAll((suite) => WebTest.mergeAndTeardown(suite));

    return {
      create: async (
        targetUrl: string,
        testCtx: VitestTestContext,
        createOptions?: WebTestOptions,
      ) => {
        currentCtx = await WebTest.create(
          targetUrl,
          testCtx,
          createOptions,
        );
        return currentCtx;
      },
    };
  }
}
