import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { TestData } from './type';
import { generateTestData } from './util';

const testDataList: Array<TestData> = [];

function logger(...message: any[]) {
  if (process.env.DEBUG === 'true') {
    console.log('Midscene e2e report:', ...message);
  }
}

class MidSceneReporter implements Reporter {
  async onBegin(config: FullConfig, suite: Suite) {
    const suites = suite.allTests();
    logger(`Starting the run with ${suites.length} tests`);
  }

  onTestBegin(test: TestCase, _result: TestResult) {
    logger(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const aiActionTestData = test.annotations.filter((annotation) => {
      if (annotation.type === 'MIDSCENE_AI_ACTION') {
        return true;
      }
      return false;
    });
    aiActionTestData.forEach((testData) => {
      const parseData = JSON.parse(testData.description!);
      if (parseData.testId === test.id && !testDataList.find((item) => item.testId === test.id)) {
        testDataList.push({
          testId: test.id,
          title: test.title,
          status: result.status,
          duration: result.duration,
          location: test.location,
          dumpPath: parseData.dumpPath,
        });
      }
    });
    logger(`Finished test ${test.title}: ${result.status}`);
  }

  onEnd(result: FullResult) {
    logger(`Finished the run: ${result.status}`);
    generateTestData(testDataList);
    console.log(
      '\x1b[32m%s\x1b[0m',
      `The report is generated successfully. Run the "npx http-server -p 9888  ./midscene_run/midscene-report --log-ip false" command to start the report`,
    );
  }
}

export default MidSceneReporter;
