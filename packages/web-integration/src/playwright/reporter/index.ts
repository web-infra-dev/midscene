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

class MyReporter implements Reporter {
  onBegin(config: FullConfig, suite: Suite) {
    const suites = suite.allTests();
    console.log(`Starting the run with ${suites.length} tests`);
  }

  onTestBegin(test: TestCase, _result: TestResult) {
    console.log(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const aiActionTestData = test.annotations.filter((annotation) => {
      if (annotation.type === 'PLAYWRIGHT_AI_ACTION') {
        return true;
      }
      return false;
    });
    aiActionTestData.forEach((testData) => {
      const parseData = JSON.parse(testData.description!);
      if (parseData.testId === test.id) {
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
    console.log(`Finished test ${test.title}: ${result.status}`);
  }

  onEnd(result: FullResult) {
    console.log('testDataList', JSON.stringify(testDataList));
    console.log(`Finished the run: ${result.status}`);
    generateTestData(testDataList);
  }
}

export default MyReporter;
