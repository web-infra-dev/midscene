import assert from 'node:assert';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  type AiInspectElement,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
} from '@midscene/core';
import type { TestCase } from './util';

interface TestLog {
  success: boolean;
  caseGroup: string;
  testCase: TestCase;
  actualResult: Awaited<ReturnType<typeof AiInspectElement>>;
  cost: number;
}

export class TestResultCollector {
  private testLogs: TestLog[] = [];

  private testName: string;
  private modelName: string;
  private failedCaseLogPath: string;
  private logFilePath: string;

  constructor(testName: string, modelName: string) {
    this.testName = testName;
    this.modelName = modelName;

    const logBasePath = path.join(
      __dirname,
      `__ai_responses__/${this.modelName}`,
    );
    this.logFilePath = path.join(logBasePath, `${this.testName}.log`);
    this.failedCaseLogPath = path.join(
      logBasePath,
      `${this.testName}-failed.log`,
    );
    if (!existsSync(logBasePath)) {
      mkdirSync(logBasePath, { recursive: true });
    }

    writeFileSync(this.logFilePath, '', 'utf-8');
    writeFileSync(this.failedCaseLogPath, '', 'utf-8');
  }

  addResult(
    caseGroup: string,
    testCase: TestCase,
    actualResult: Awaited<ReturnType<typeof AiInspectElement>>,
    cost: number,
  ) {
    const sameResult = this.compareResult(testCase, actualResult);

    const testLog: TestLog = {
      success: sameResult,
      caseGroup,
      testCase,
      actualResult,
      cost,
    };
    this.testLogs.push(testLog);
    // log result
    const logContent = `
${testLog.success ? 'success' : 'failed'}: 
${testLog.caseGroup} - ${testLog.testCase.prompt}
ActualResponse:
${JSON.stringify(testLog.actualResult, null, 2)}
ExpectedResponse:
${testLog.success ? '(skipped)' : JSON.stringify(testLog.testCase.response, null, 2)}
--------------------------------
`;
    appendFileSync(this.logFilePath, logContent, 'utf-8');

    if (!sameResult) {
      appendFileSync(this.failedCaseLogPath, logContent, 'utf-8');
    }
  }

  analyze(allowFailCaseCount = 0) {
    // group by caseGroup, calculate the pass rate and average cost of each group
    const groupedTestLogs = this.testLogs.reduce(
      (acc, log) => {
        acc[log.caseGroup] = acc[log.caseGroup] || [];
        acc[log.caseGroup].push(log);
        return acc;
      },
      {} as Record<string, TestLog[]>,
    );
    const resultData = Object.entries(groupedTestLogs).map(
      ([caseGroup, testLogs]) => {
        const passRate =
          testLogs.filter((log) => log.success).length / testLogs.length;
        const averageCost =
          testLogs.reduce((acc, log) => acc + log.cost, 0) / testLogs.length;
        const totalTimeCost = testLogs.reduce((acc, log) => acc + log.cost, 0);
        const averagePromptTokens =
          testLogs.reduce(
            (acc, log) => acc + (log.actualResult.usage?.prompt_tokens || 0),
            0,
          ) / testLogs.length;
        const averageCompletionTokens =
          testLogs.reduce(
            (acc, log) =>
              acc + (log.actualResult.usage?.completion_tokens || 0),
            0,
          ) / testLogs.length;
        return {
          caseGroup,
          caseCount: testLogs.length,
          successCount: testLogs.filter((log) => log.success).length,
          failCount: testLogs.filter((log) => !log.success).length,
          passRate: `${(passRate * 100).toFixed(2)}%`,
          averageCost: `${averageCost.toFixed(2)}ms`,
          averagePromptTokens: `${averagePromptTokens.toFixed(2)}`,
          averageCompletionTokens: `${averageCompletionTokens.toFixed(2)}`,
          totalTimeCost: `${totalTimeCost}ms`,
        };
      },
    );

    console.log(`${this.testName}, ${this.modelName}`);
    console.table(resultData);

    // check if the fail count is greater than the allowFailCaseCount
    const failedCaseGroups = resultData.filter(
      (item) => item.failCount > allowFailCaseCount,
    );
    let errMsg = '';
    if (failedCaseGroups.length > 0) {
      errMsg = `Failed case groups: ${failedCaseGroups.map((item) => item.caseGroup).join(', ')}`;
      console.log(errMsg);
      console.log('error log file:', this.failedCaseLogPath);
      throw new Error(errMsg);
    }
    return resultData;
  }

  private compareResult(
    testCase: TestCase,
    result: Awaited<ReturnType<typeof AiInspectElement>>,
  ) {
    const distanceThreshold = 16;
    // compare coordinates
    if (result.rawResponse.coordinates) {
      assert(
        testCase.response_coordinates,
        'testCase.response_coordinates is required',
      );
      const distance = Math.floor(
        Math.sqrt(
          (result.rawResponse.coordinates[0] -
            testCase.response_coordinates[0]) **
            2 +
            (result.rawResponse.coordinates[1] -
              testCase.response_coordinates[1]) **
              2,
        ),
      );

      if (distance > distanceThreshold) {
        console.log(
          `distance: ${distance} is greater than threshold: ${distanceThreshold}, the prompt is: ${testCase.prompt}`,
        );
        return false;
      }

      return true;
    }
    // compare id
    const expectedId = testCase.response[0].id;
    const expectedIndexId = testCase.response[0].indexId;
    const actualId = result.parseResult.elements[0].id;
    return actualId === expectedId || `${actualId}` === `${expectedIndexId}`;
  }
}
