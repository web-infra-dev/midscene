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

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testTitleToFilename = new Map<string, string>();
  mode?: 'merged' | 'separate';

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

  async onBegin(config: FullConfig, suite: Suite) {
    const selfPackageName = '@midscene/web/playwright-reporter';
    const reporterConfig = config.reporter?.find(
      (r) =>
        Array.isArray(r) &&
        typeof r[0] === 'string' &&
        // __filename is the absolute path of the current file
        (r[0] === __filename || r[0] === selfPackageName),
    );

    const options = Array.isArray(reporterConfig)
      ? reporterConfig[1]
      : undefined;
    if (options?.type) {
      this.mode = MidsceneReporter.getMode(options?.type);
    }
    // const suites = suite.allTests();
    // logger(`Starting the run with ${suites.length} tests`);
  }

  onTestBegin(test: TestCase, _result: TestResult) {
    // logger(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const dumpAnnotation = test.annotations.find((annotation) => {
      return annotation.type === 'MIDSCENE_DUMP_ANNOTATION';
    });
    if (!dumpAnnotation?.description) return;
    const retry = result.retry ? `(retry #${result.retry})` : '';
    const testId = `${test.id}${retry}`;
    const testData: ReportDumpWithAttributes = {
      dumpString: dumpAnnotation.description,
      attributes: {
        playwright_test_id: testId,
        playwright_test_title: `${test.title}${retry}`,
        playwright_test_status: result.status,
        playwright_test_duration: result.duration,
      },
    };

    this.updateReport(testData);

    test.annotations = test.annotations.filter(
      (annotation) => annotation.type !== 'MIDSCENE_DUMP_ANNOTATION',
    );
  }

  onEnd(result: FullResult) {
    logger(`Finished the run: ${result.status}`);
  }
}

export default MidsceneReporter;
