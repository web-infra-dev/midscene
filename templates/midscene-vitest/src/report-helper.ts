import type { TestStatus } from '@midscene/core';
import { ReportMergingTool } from '@midscene/core/report';
import type {
  RunnerTestSuite,
  TestContext as VitestTestContext,
} from 'vitest';
import { generateTimestamp } from './utils';

export interface ReportableContext {
  reportFile: string | null | undefined;
  startTime: number;
  destroy(): Promise<void>;
}

/**
 * Manages report collection and merging across test runs.
 * Each platform context class creates its own instance.
 */
export class ReportHelper {
  private reportTool = new ReportMergingTool();
  private individualReports: string[] = [];

  reset(): void {
    this.reportTool = new ReportMergingTool();
    this.individualReports = [];
  }

  async collectReport(
    ctx: ReportableContext | undefined,
    testCtx: VitestTestContext,
  ): Promise<void> {
    let status: TestStatus = 'passed';
    if (testCtx.task.result?.state === 'pass') {
      status = 'passed';
    } else if (
      testCtx.task.result?.errors?.[0]?.message.includes('timed out')
    ) {
      status = 'timedOut';
    } else if (testCtx.task.result?.state === 'fail') {
      status = 'failed';
    }

    await ctx?.destroy();

    const reportFile = ctx?.reportFile ?? undefined;

    this.reportTool.append({
      reportFilePath: reportFile,
      reportAttributes: {
        testId: testCtx.task.id,
        testTitle: testCtx.task.name,
        testDescription: '',
        testDuration: ctx
          ? Math.round(performance.now() - ctx.startTime)
          : 0,
        testStatus: status,
      },
    });

    if (reportFile) {
      this.individualReports.push(reportFile);
    }
  }

  mergeReports(
    suite: RunnerTestSuite,
    reportName?: string,
  ): string | null {
    const finalReportName = `E2E-${(reportName ?? suite.name) || 'MergedReport'}-${generateTimestamp()}`;

    for (const task of suite.tasks) {
      if (task.mode === 'skip') {
        this.reportTool.append({
          reportAttributes: {
            testId: task.id,
            testTitle: task.name,
            testDescription: '',
            testDuration: 0,
            testStatus: 'skipped',
          },
        });
      }
    }

    const merged = this.reportTool.mergeReports(finalReportName);

    const report = merged ?? this.individualReports[0] ?? null;
    if (report && suite.meta) {
      suite.meta.midsceneReport = report;
    }

    this.individualReports = [];
    return merged;
  }
}

/**
 * Build report file name and group name from vitest test context.
 */
export function buildReportMeta(testCtx: {
  task: { name: string; suite?: { name: string } };
}): { groupName: string; reportFileName: string } {
  const groupName = testCtx.task.suite?.name || 'UnnamedGroup';
  const taskName = testCtx.task.name;
  return {
    groupName: `E2E: ${groupName}`,
    reportFileName: `E2E-${groupName}-${taskName}-${generateTimestamp()}`,
  };
}
