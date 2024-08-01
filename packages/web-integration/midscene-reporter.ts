import path from 'path';
import fs from 'fs';
import assert from 'assert';
import os from 'os';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  Location,
} from '@playwright/test/reporter';
import fsExtra from 'fs-extra';

type TestData = {
  testId: string;
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  /**
   * Running time in milliseconds.
   */
  duration: number;
  /**
   * Optional location in the source where the step is defined.
   */
  location?: Location;
  dumpPath?: string;
};

const testDataList: Array<TestData> = [];

class MidScenePlaywrightReporter implements Reporter {
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

function generateTestData(testDataList: Array<TestData>) {
  const filterDataList = testDataList.reduce((res, testData) => {
    if (res.find((item) => item.testId === testData.testId)) {
      return res;
    } else {
      return [...res, testData];
    }
  }, [] as Array<TestData>);
  const projectDir = process.cwd();
  const reportDir = path.join(projectDir, 'midscene-report');

  // Create a report folder
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Copy the contents of the report html folder to the report folder
  const reportHtmlDir = path.join(projectDir, `node_modules/@midscene/visualizer-report/.output`);
  if (!fs.existsSync(reportHtmlDir)) {
    fs.mkdirSync(reportHtmlDir, { recursive: true });
  }
  const tempDir = path.join(os.tmpdir(), 'temp-folder');
  try {
    // First copy to the temporary directory
    fsExtra.copySync(reportHtmlDir, tempDir);
    // Then move the contents of the temporary directory to the destination directory
    fsExtra.moveSync(tempDir, reportDir, { overwrite: true });
    console.log('Copy completed!');
  } catch (err) {
    console.error('An error occurred while copying the folder.', err);
  }

  try {
    fsExtra.removeSync(path.join(reportDir, 'public'));
    console.log('Public Folder deleted successfully!');
  } catch (err) {
    console.error('An error occurred while deleting the folder.', err);
  }

  for (const testData of filterDataList) {
    const { dumpPath } = testData;
    if (dumpPath) {
      const srcFile = dumpPath.split('/').pop();
      assert(srcFile, `Failed to get source file name from ${dumpPath}`);
      const destFile = path.join(reportDir, 'public', srcFile);
      fsExtra.copySync(dumpPath, destFile);
    }
  }

  try {
    fsExtra.outputFileSync(
      path.join(reportDir, 'public', 'test-data-list.json'),
      JSON.stringify({ 'test-list': filterDataList }),
    );
    console.log('File written successfully!');
  } catch (err) {
    console.error('An error occurred while writing to the file.', err);
  }

  const filePath = path.join(reportDir, 'index.js'); // File path
  const searchValue = 'Server is listening on http://[::]:'; // The content to be replaced can be a string or a regular expression
  const replaceValue = 'The report has been generated on http://127.0.0.1:'; // The replaced content

  try {
    // Read file contents
    let fileContent = fs.readFileSync(filePath, 'utf8');

    // Replace file contents
    fileContent = fileContent.replace(searchValue, replaceValue);

    // Writes the modified content to the file
    fsExtra.outputFileSync(filePath, fileContent);

    console.log('File content replaced and written successfully!');
  } catch (err) {
    console.error('An error occurred:', err);
  }
}

export default MidScenePlaywrightReporter;
