import path from 'path';
import fs from 'fs';
import assert from 'assert';
import os from 'os';
import fsExtra from 'fs-extra';
import { TestData } from './type';

export function generateTestData(testDataList: Array<TestData>) {
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
    fs.mkdirSync(reportDir);
  }

  // Copy the contents of the report html folder to the report folder
  const reportHtmlDir = path.join(projectDir, `node_modules/@midscene/visualizer-report/.output`);
  const tempDir = path.join(os.tmpdir(), 'temp-folder');
  try {
    // First copy to the temporary directory
    fsExtra.copySync(reportHtmlDir, tempDir);
    // Then move the contents of the temporary directory to the destination directory
    fsExtra.moveSync(tempDir, reportDir, { overwrite: true });
  } catch (err) {
    console.error('An error occurred while copying the folder.', err);
  }

  try {
    fsExtra.removeSync(path.join(reportDir, 'public'));
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
  } catch (err) {
    console.error('An error occurred while writing to the file.', err);
  }

  // modify log content
  try {
    const filePath = path.join(reportDir, 'index.js'); // File path
    const searchValue = 'Server is listening on http://[::]:'; // The content to be replaced can be a string or a regular expression
    const replaceValue = 'The report has been generated on http://127.0.0.1:'; // The replaced content
    // Read file contents
    let fileContent = fs.readFileSync(filePath, 'utf8');

    // Replace file contents
    fileContent = fileContent.replace(searchValue, replaceValue);
    fileContent = fileContent.replace('8080', '9988');

    // Writes the modified content to the file
    fsExtra.outputFileSync(filePath, fileContent);
  } catch (err) {
    console.error('An error occurred:', err);
  }

  // close log
  try {
    const filePath = path.join(reportDir, 'node_modules/@modern-js/prod-server/dist/cjs/apply.js'); // File path
    let fileContent = fs.readFileSync(filePath, 'utf8');
    fileContent = fileContent.replace('(0, import_server_core.logPlugin)(),', '');

    // Writes the modified content to the file
    fsExtra.outputFileSync(filePath, fileContent);
  } catch (err) {
    console.error('An error occurred:', err);
  }
}
