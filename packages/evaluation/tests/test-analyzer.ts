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
  type plan,
} from '@midscene/core';
import { expect } from 'vitest';
import type { TestCase } from './util';

type ActualResult =
  | Awaited<ReturnType<typeof AiInspectElement>>
  | Awaited<ReturnType<typeof plan>>;

interface TestLog {
  success: boolean;
  caseGroup: string;
  testCase: TestCase;
  actualResult: ActualResult | Error;
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
    this.logFilePath = path.join(
      logBasePath,
      `${this.testName}-${process.pid}.log`,
    );
    this.failedCaseLogPath = path.join(
      logBasePath,
      `${this.testName}-${process.pid}-failed.log`,
    );
    if (!existsSync(logBasePath)) {
      mkdirSync(logBasePath, { recursive: true });
    }

    appendFileSync(this.logFilePath, '', 'utf-8');
    appendFileSync(this.failedCaseLogPath, '', 'utf-8');
  }

  addResult(
    caseGroup: string,
    testCase: TestCase,
    actualResult: ActualResult | Error,
    cost: number,
  ) {
    const sameResult = this.compareResult(testCase, actualResult);
    const errorMsg = sameResult instanceof Error ? sameResult.message : '';

    const testLog: TestLog = {
      success: sameResult === true,
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
${errorMsg ? `Error: ${errorMsg}` : ''}
--------------------------------
`;
    appendFileSync(this.logFilePath, logContent, 'utf-8');

    if (sameResult !== true) {
      appendFileSync(this.failedCaseLogPath, `${logContent}\n`, 'utf-8');
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
          cases: testLogs.length,
          success: testLogs.filter((log) => log.success).length,
          fail: testLogs.filter((log) => !log.success).length,
          passRate: `${(passRate * 100).toFixed(2)}%`,
          averageCost: `${averageCost.toFixed(2)}ms`,
          averagePromptTokens: `${averagePromptTokens.toFixed(0)}`,
          averageCompletionTokens: `${averageCompletionTokens.toFixed(0)}`,
          totalTimeCost: `${totalTimeCost}ms`,
        };
      },
    );

    console.log(`${this.testName}, ${this.modelName}`);
    console.table(resultData);

    // check if the fail count is greater than the allowFailCaseCount
    const failedCaseGroups = resultData.filter(
      (item) => item.fail > allowFailCaseCount,
    );
    let errMsg = '';
    if (failedCaseGroups.length > allowFailCaseCount) {
      errMsg = `Failed case groups: ${failedCaseGroups.map((item) => item.caseGroup).join(', ')}`;
      console.log(errMsg);
      console.log('error log file:', this.failedCaseLogPath);
      throw new Error(errMsg);
    }
    return resultData;
  }

  private compareResult(
    testCase: TestCase,
    result: ActualResult | Error,
  ): true | Error {
    const distanceThreshold = 16;

    if (testCase.response_planning?.error) {
      if (!(result instanceof Error)) {
        const msg = `Expected error: ${testCase.response_planning.error}, but got ${JSON.stringify(result, null, 2)}, the prompt is: ${testCase.prompt}`;
        return new Error(msg);
      }
      return true;
    }

    if (result instanceof Error) {
      const msg = `got error: ${result}, but expected?.error is not set, the prompt is: ${testCase.prompt}`;
      return new Error(msg);
    }

    // compare coordinates
    if ('rawResponse' in result && result.rawResponse.bbox) {
      assert(testCase.response_bbox, 'testCase.response_bbox is required');
      const centerX =
        (result.rawResponse.bbox[0] + result.rawResponse.bbox[2]) / 2;
      const centerY =
        (result.rawResponse.bbox[1] + result.rawResponse.bbox[3]) / 2;

      const expectedCenterX =
        (testCase.response_bbox[0] + testCase.response_bbox[2]) / 2;
      const expectedCenterY =
        (testCase.response_bbox[1] + testCase.response_bbox[3]) / 2;
      const distance = Math.floor(
        Math.sqrt(
          (centerX - expectedCenterX) ** 2 + (centerY - expectedCenterY) ** 2,
        ),
      );

      if (distance > distanceThreshold) {
        const msg = `distance: ${distance} is greater than threshold: ${distanceThreshold}, the prompt is: ${testCase.prompt}`;
        return new Error(msg);
      }

      return true;
    }

    if ('parseResult' in result) {
      // compare id
      const expectedId = testCase.response[0].id;
      const expectedIndexId = testCase.response[0].indexId;
      const actualId = result.parseResult.elements[0].id;
      if (actualId !== expectedId && `${actualId}` !== `${expectedIndexId}`) {
        const msg = `actualId: ${actualId} is not equal to expectedId: ${expectedId} or expectedIndexId: ${expectedIndexId}, the prompt is: ${testCase.prompt}`;
        console.log(msg);
        return new Error(msg);
      }
      return true;
    }

    if ('actions' in result) {
      // compare actions
      const expected = testCase.response_planning;

      // check step names and order
      const steps =
        (expected?.actions || []).map((action) => {
          return action.type;
        }) || [];
      const actualActions = result.actions!.map((action) => {
        return action.type;
      });
      // tell if steps and actualActions are the same
      if (steps.length !== actualActions.length) {
        const msg = `steps.length: ${steps.length} is not equal to actualActions.length: ${actualActions.length}, the prompt is: ${testCase.prompt}`;
        return new Error(msg);
      }
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] !== actualActions[i]) {
          const msg = `steps[${i}]: ${steps[i]} is not equal to actualActions[${i}]: ${actualActions[i]}, the prompt is: ${testCase.prompt}`;
          return new Error(msg);
        }
      }

      if (
        expected?.more_actions_needed_by_instruction !==
        result.more_actions_needed_by_instruction
      ) {
        const msg = `expected?.more_actions_needed_by_instruction: ${expected?.more_actions_needed_by_instruction} is not equal to result.more_actions_needed_by_instruction: ${result.more_actions_needed_by_instruction}, the prompt is: ${testCase.prompt}`;
        return new Error(msg);
      }

      return true;
    }

    const msg = `unknown result type, can not compare, the prompt is: ${testCase.prompt}`;
    return new Error(msg);
  }
}
