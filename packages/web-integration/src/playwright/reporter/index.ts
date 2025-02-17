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
let filename: string;
function updateReport() {
  const reportPath = writeDumpReport(filename, testDataList);
  reportPath && printReportMsg(reportPath);
}

class MidsceneReporter implements Reporter {
  async onBegin(config: FullConfig, suite: Suite) {
    if (!filename) {
      filename = reportFileName('playwright-merged');
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
    testDataList.push({
      dumpString: dumpAnnotation.description,
      attributes: {
        playwright_test_id: test.id,
        playwright_test_title: test.title,
        playwright_test_status: result.status,
        playwright_test_duration: result.duration,
      },
    });

    test.annotations = test.annotations.filter(
      (annotation) => annotation.type !== 'MIDSCENE_DUMP_ANNOTATION',
    );

    updateReport();
  }

  onEnd(result: FullResult) {
    updateReport();

    logger(`Finished the run: ${result.status}`);
  }
}

export default MidsceneReporter;
