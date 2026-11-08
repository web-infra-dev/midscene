import { existsSync, mkdirSync } from 'node:fs';
import type { ReportFileWithAttributes, TestStatus } from '@midscene/core';
import { getReportFileName, printReportMsg } from '@midscene/core/agent';
import { ReportMergingTool } from '@midscene/core/report';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { logMsg } from '@midscene/shared/utils';
import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { buildPlaywrightReportTag } from '../report-filename';

interface MidsceneReporterOptions {
  type?: 'merged' | 'separate';
  outputFormat?: 'single-html' | 'html-and-external-assets';
}

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testIdToFilename = new Map<string, string>();
  private reportsByTestId = new Map<
    string,
    {
      testTitle: string;
      reports: ReportFileWithAttributes[];
    }
  >();
  mode?: 'merged' | 'separate';
  outputFormat: 'single-html' | 'html-and-external-assets';
  private hasMultipleProjects = false;

  constructor(options: MidsceneReporterOptions = {}) {
    this.mode = MidsceneReporter.getMode(options.type ?? 'merged');
    this.outputFormat = options.outputFormat ?? 'single-html';
  }

  private static getMode(reporterType: string): 'merged' | 'separate' {
    if (!reporterType) {
      return 'merged';
    }
    if (reporterType !== 'merged' && reporterType !== 'separate') {
      throw new Error(
        `Unknown reporter type in playwright config: ${reporterType}, only support 'merged' or 'separate'`,
      );
    }
    return reporterType;
  }

  private getSeparatedFilename(testTitle: string, testId: string): string {
    if (!this.testIdToFilename.has(testId)) {
      const baseTag = buildPlaywrightReportTag(testTitle, undefined, testId);
      const generatedFilename = getReportFileName(baseTag);
      this.testIdToFilename.set(testId, generatedFilename);
    }
    return this.testIdToFilename.get(testId)!;
  }

  private getReportFilename(testTitle?: string, testId?: string): string {
    if (this.mode === 'merged') {
      if (!this.mergedFilename) {
        this.mergedFilename = getReportFileName('playwright-merged');
      }
      return this.mergedFilename;
    }
    if (this.mode === 'separate') {
      if (!testTitle) throw new Error('testTitle is required in separate mode');
      if (!testId) throw new Error('testId is required in separate mode');
      return this.getSeparatedFilename(testTitle, testId);
    }
    throw new Error(`Unknown mode: ${this.mode}`);
  }

  private ensureOutputRoot(): void {
    mkdirSync(getMidsceneRunSubDir('report'), { recursive: true });
  }

  private mergeOwnedReports(
    tool: ReportMergingTool,
    targetName: string,
  ): string | null {
    return tool.mergeReports(targetName, {
      overwrite: true,
      rmOriginalReports: true,
      outputFormat: this.outputFormat,
    });
  }

  private collectReportInfo(test: TestCase, result: TestResult) {
    const reportAnnotations = test.annotations.filter((annotation) => {
      return (
        annotation.type === 'MIDSCENE_DUMP_ANNOTATION' && annotation.description
      );
    });
    if (reportAnnotations.length === 0 || !this.mode) {
      return;
    }

    const retry = result.retry ? `(retry #${result.retry})` : '';
    const testId = `${test.id}${retry}`;
    const projectName = this.hasMultipleProjects
      ? test.parent?.project()?.name
      : undefined;
    const projectSuffix = projectName ? ` [${projectName}]` : '';
    const testTitle = `${test.title}${projectSuffix}${retry}`;
    const reports = reportAnnotations
      .map((annotation) => annotation.description!)
      .filter((reportFilePath) => {
        if (existsSync(reportFilePath)) {
          return true;
        }
        logMsg(
          `Failed to read Midscene report file: ${reportFilePath}`,
          new Error('Report file does not exist'),
        );
        return false;
      })
      .map((reportFilePath): ReportFileWithAttributes => {
        return {
          reportFilePath,
          reportAttributes: {
            testDuration: result.duration,
            testStatus: result.status as TestStatus,
            testTitle,
            testId,
            testDescription: test.parent?.title || '',
          },
        };
      });

    if (reports.length === 0) {
      return;
    }

    this.reportsByTestId.set(testId, {
      testTitle,
      reports,
    });
  }

  private finalizeMergedReport(): void {
    this.ensureOutputRoot();
    const tool = new ReportMergingTool();
    let reportCount = 0;
    for (const entry of this.reportsByTestId.values()) {
      for (const report of entry.reports) {
        tool.append(report);
        reportCount += 1;
      }
    }

    if (reportCount === 0) {
      return;
    }

    const targetName = this.getReportFilename();
    const mergedReportPath = this.mergeOwnedReports(tool, targetName);
    if (mergedReportPath) {
      printReportMsg(mergedReportPath);
    }
  }

  private finalizeSeparateReports(): void {
    this.ensureOutputRoot();
    for (const [testId, entry] of this.reportsByTestId) {
      const targetName = this.getReportFilename(entry.testTitle, testId);
      const tool = new ReportMergingTool();
      for (const report of entry.reports) {
        tool.append(report);
      }
      const reportPath = this.mergeOwnedReports(tool, targetName);
      if (reportPath) {
        printReportMsg(reportPath);
      }
    }
  }

  async onBegin(config: FullConfig, _suite: Suite) {
    this.hasMultipleProjects = (config.projects?.length || 0) > 1;
  }

  onTestBegin(_test: TestCase, _result: TestResult) {}

  onTestEnd(test: TestCase, result: TestResult) {
    this.collectReportInfo(test, result);
  }

  async onEnd() {
    if (this.mode === 'merged') {
      this.finalizeMergedReport();
      return;
    }

    if (this.mode === 'separate') {
      this.finalizeSeparateReports();
    }
  }
}

export default MidsceneReporter;
