import type {
  RunnerTestSuite,
  TestContext as VitestTestContext,
} from 'vitest';
import { ReportHelper } from '../report-helper';

/**
 * Minimal agent interface — all Midscene agents (Playwright / Android / iOS)
 * satisfy this via `@midscene/core/agent`.
 */
interface AgentLike {
  reportFile?: string | null;
  destroy(): Promise<void>;
}

/**
 * A fixture returned by `XxxTest.init()` that provides a `createContext`
 * method for producing per-test contexts.
 */
export interface TestFixture<TCtx, TCreateArgs extends any[] = [string, VitestTestContext]> {
  create(...args: TCreateArgs): Promise<TCtx>;
}

/**
 * Base class for all platform test contexts.
 *
 * Handles the instance-level lifecycle (agent, reportFile, destroy)
 * so each platform only needs to implement setup/create/teardown.
 */
export abstract class BaseTestContext<TAgent extends AgentLike> {
  agent: TAgent;
  startTime: number;
  private _reportFile: string | null | undefined;

  protected constructor(agent: TAgent) {
    this.agent = agent;
    this.startTime = performance.now();
  }

  get reportFile(): string | null | undefined {
    return this._reportFile ?? this.agent.reportFile;
  }

  async destroy(): Promise<void> {
    await this.agent.destroy();
    this._reportFile = this.agent.reportFile;
    await this.onDestroy();
  }

  /** Override in subclass for extra cleanup (e.g. close page). */
  protected async onDestroy(): Promise<void> {}

  // ── Static helpers for subclasses ──────────────────────────

  protected static _collectReport(
    reportHelper: ReportHelper,
    ctx: BaseTestContext<AgentLike> | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    return reportHelper.collectReport(ctx, testCtx);
  }

  protected static _mergeAndTeardown(
    reportHelper: ReportHelper,
    teardownFn: () => Promise<void>,
    suite: RunnerTestSuite,
    reportName?: string,
  ): Promise<string | null> {
    const merged = reportHelper.mergeReports(suite, reportName);
    return teardownFn().then(() => merged);
  }
}
