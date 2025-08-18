import { readFileSync, rmSync } from 'node:fs';
import {
  getReportFileName,
  printReportMsg,
  replaceIllegalPathCharsAndSpace,
} from '@/common/utils';
import type { ReportDumpWithAttributes } from '@midscene/core';
import { writeDumpReport } from '@midscene/core/utils';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

function logger(...message: any[]) {
  if (process.env.DEBUG === 'true') {
    console.log('Midscene e2e report:', ...message);
  }
}

interface MidsceneReporterOptions {
  type?: 'merged' | 'separate';
}

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testTitleToFilename = new Map<string, string>();
  mode?: 'merged' | 'separate';

  constructor(options: MidsceneReporterOptions = {}) {
    // Set mode from constructor options (official Playwright way)
    this.mode = MidsceneReporter.getMode(options.type ?? 'merged');
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

  private getSeparatedFilename(testTitle: string): string {
    if (!this.testTitleToFilename.has(testTitle)) {
      const baseTag = `playwright-${replaceIllegalPathCharsAndSpace(testTitle)}`;
      const generatedFilename = getReportFileName(baseTag);
      this.testTitleToFilename.set(testTitle, generatedFilename);
    }
    return this.testTitleToFilename.get(testTitle)!;
  }

  private getReportFilename(testTitle?: string): string {
    if (this.mode === 'merged') {
      if (!this.mergedFilename) {
        this.mergedFilename = getReportFileName('playwright-merged');
      }
      return this.mergedFilename;
    } else if (this.mode === 'separate') {
      if (!testTitle) throw new Error('testTitle is required in separate mode');
      return this.getSeparatedFilename(testTitle);
    }
    throw new Error(`Unknown mode: ${this.mode}`);
  }

  private updateReport(testData: ReportDumpWithAttributes) {
    if (!testData || !this.mode) return;
    const fileName = this.getReportFilename(
      testData.attributes?.playwright_test_title,
    );
    const reportPath = writeDumpReport(
      fileName,
      testData,
      this.mode === 'merged',
    );
    reportPath && printReportMsg(reportPath);
  }

  async onBegin(config: FullConfig, suite: Suite) {}

  onTestBegin(_test: TestCase, _result: TestResult) {
    // logger(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const dumpAnnotation = test.annotations.find((annotation) => {
      return annotation.type === 'MIDSCENE_DUMP_ANNOTATION';
    });
    if (!dumpAnnotation?.description) return;

    const tempFilePath = dumpAnnotation.description;
    let dumpString: string;

    try {
      dumpString = readFileSync(tempFilePath, 'utf-8');
      logger(`Read dump from temp file: ${tempFilePath}`);
    } catch (error) {
      console.error(`Failed to read dump file: ${tempFilePath}`, error);
      return;
    }

    const retry = result.retry ? `(retry #${result.retry})` : '';
    const testId = `${test.id}${retry}`;
    const testData: ReportDumpWithAttributes = {
      dumpString,
      attributes: {
        playwright_test_id: testId,
        playwright_test_title: `${test.title}${retry}`,
        playwright_test_status: result.status,
        playwright_test_duration: result.duration,
      },
    };

    this.updateReport(testData);

    // Clean up: delete temp file
    try {
      rmSync(tempFilePath, { force: true });
      logger(`Deleted temp file: ${tempFilePath}`);
    } catch (error) {
      console.warn(`Failed to delete temp file: ${tempFilePath}`, error);
    }
  }

  onEnd(result: FullResult) {
    logger(`Finished the run: ${result.status}`);
  }
}

export default MidsceneReporter;
