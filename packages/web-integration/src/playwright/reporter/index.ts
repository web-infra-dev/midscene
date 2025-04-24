import { printReportMsg, reportFileName } from '@/common/utils';
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

const testDataList: Array<ReportDumpWithAttributes> = [];
let mergedFilename: string;
const testTitleToFilename: Map<string, string> = new Map();

function getStableFilename(testTitle: string): string {
  if (!testTitleToFilename.has(testTitle)) {
    // use reportFileName to generate the base filename
    // only replace the illegal characters in the file system: /, \, :, *, ?, ", <, >, |
    const baseTag = `playwright-${testTitle.replace(/[/\\:*?"<>|]/g, '-')}`;
    const generatedFilename = reportFileName(baseTag);
    testTitleToFilename.set(testTitle, generatedFilename);
  }
  return testTitleToFilename.get(testTitle)!;
}

function updateReport(mode: 'merged' | 'separate', testId?: string) {
  if (mode === 'separate' && testId) {
    // in separate mode, find the data for the corresponding testID and generate a separate report
    const testData = testDataList.find(
      (data) => data.attributes?.playwright_test_id === testId,
    );

    if (testData) {
      // use the stable filename
      const stableFilename = getStableFilename(
        testData.attributes?.playwright_test_title,
      );
      const reportPath = writeDumpReport(stableFilename, [testData]);
      reportPath && printReportMsg(reportPath);
    }
  } else if (mode === 'merged') {
    // in merged mode, write all test data into one file
    if (!mergedFilename) {
      mergedFilename = reportFileName('playwright-merged');
    }

    const reportPath = writeDumpReport(mergedFilename, testDataList);
    reportPath && printReportMsg(reportPath);
  } else {
    throw new Error(
      `Unknown reporter type in playwright config: ${mode}, only support 'merged' or 'separate'`,
    );
  }
}

function getMode(reporterType: string) {
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

class MidsceneReporter implements Reporter {
  mode?: 'merged' | 'separate';

  async onBegin(config: FullConfig, suite: Suite) {
    const reporterType = config.reporter?.[1]?.[1]?.type;

    this.mode = getMode(reporterType);

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

    const testData: ReportDumpWithAttributes = {
      dumpString: dumpAnnotation.description,
      attributes: {
        playwright_test_id: test.id,
        playwright_test_title: test.title,
        playwright_test_status: result.status,
        playwright_test_duration: result.duration,
      },
    };

    testDataList.push(testData);

    updateReport(this.mode!, test.id);

    test.annotations = test.annotations.filter(
      (annotation) => annotation.type !== 'MIDSCENE_DUMP_ANNOTATION',
    );
  }

  onEnd(result: FullResult) {
    updateReport(this.mode!);

    logger(`Finished the run: ${result.status}`);
  }
}

export default MidsceneReporter;
