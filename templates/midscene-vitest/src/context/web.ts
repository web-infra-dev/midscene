import { PlaywrightAgent, type WebPageAgentOpt } from '@midscene/web/playwright';
import { type Browser, type Page, chromium } from 'playwright';
import { ReportHelper, buildReportMeta } from '../report-helper';
import type { RunnerTestSuite, TestContext as VitestTestContext } from 'vitest';
import { BaseTestContext } from './base';

const DEFAULT_ARGS = ['--no-sandbox', '--ignore-certificate-errors'];

export interface WebTestContextOptions {
  viewport?: { width: number; height: number };
  headless?: boolean;
  /** Options passed to PlaywrightAgent (e.g. aiActionContext, modelConfig). */
  agentOptions?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>;
}

export class WebTestContext extends BaseTestContext<PlaywrightAgent> {
  private static sharedBrowser: Browser | null = null;
  private static sharedOptions: WebTestContextOptions = {};
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
  static async setup(options?: WebTestContextOptions): Promise<void> {
    WebTestContext.sharedOptions = options ?? {};
    WebTestContext.sharedBrowser = await chromium.launch({
      headless: options?.headless ?? true,
      args: DEFAULT_ARGS,
    });
    WebTestContext.reportHelper.reset();
  }

  /**
   * Create a new page + agent on the shared browser. Call in each `it` block.
   */
  static async create(
    targetUrl: string,
    testCtx: {
      task: { name: string; suite?: { name: string } };
    },
    options?: WebTestContextOptions,
  ): Promise<WebTestContext> {
    if (!WebTestContext.sharedBrowser) {
      await WebTestContext.setup(options);
    }
    const opts = { ...WebTestContext.sharedOptions, ...options };
    const page = await WebTestContext.sharedBrowser!.newPage({
      viewport: opts.viewport ?? { width: 1920, height: 1080 },
    });
    await page.goto(targetUrl);

    const { groupName, reportFileName } = buildReportMeta(testCtx);
    const agent = new PlaywrightAgent(page, {
      ...opts.agentOptions,
      groupName,
      reportFileName,
    });
    return new WebTestContext(page, agent);
  }

  static async collectReport(
    ctx: WebTestContext | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return BaseTestContext._collectReport(
      WebTestContext.reportHelper,
      ctx,
      testCtx,
    );
  }

  static async mergeAndTeardown(
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    return BaseTestContext._mergeAndTeardown(
      WebTestContext.reportHelper,
      WebTestContext.teardown,
      suite,
      reportName,
    );
  }

  static async teardown(): Promise<void> {
    await WebTestContext.sharedBrowser?.close();
    WebTestContext.sharedBrowser = null;
  }
}
