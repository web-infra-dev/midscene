import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
} from '@midscene/core';
import type { test as rstestTest } from '@rstest/core';
import type { BatchRunnerConfig } from '../batch-runner';
import { runYamlBatchInRstest } from './yaml-batch';
import {
  type RunYamlCaseOptions,
  createYamlCaseFailure,
  runYamlCaseResult,
} from './yaml-case';

export type RstestTest = typeof rstestTest;

export interface DefineYamlCaseTestOptions {
  testName: string;
  yamlFile: string;
  resultFile: string;
  caseOptions?: Omit<RunYamlCaseOptions, 'file' | 'headed' | 'keepWindow'>;
  webRuntimeOptions?: Pick<RunYamlCaseOptions, 'headed' | 'keepWindow'>;
}

export interface DefineYamlBatchTestOptions {
  testName: string;
  config: BatchRunnerConfig;
  resultFiles: Record<string, string>;
}

const errorMessageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const writeResultFile = (
  resultFile: string,
  data: MidsceneYamlConfigResult,
) => {
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(data, null, 2));
};

const attemptHistoryFileFor = (resultFile: string): string =>
  `${resultFile}.attempts.json`;

const readAttemptHistory = (
  resultFile: string,
): MidsceneYamlConfigAttempt[] => {
  const attemptHistoryFile = attemptHistoryFileFor(resultFile);
  if (!existsSync(attemptHistoryFile)) return [];

  return JSON.parse(
    readFileSync(attemptHistoryFile, 'utf8'),
  ) as MidsceneYamlConfigAttempt[];
};

const toAttemptResult = (
  result: MidsceneYamlConfigResult,
  attempt: number,
): MidsceneYamlConfigAttempt => ({
  attempt,
  success: result.success,
  output: result.output,
  report: result.report,
  error: result.error,
  duration: result.duration,
  resultType: result.resultType,
});

const appendAttemptHistory = (
  resultFile: string,
  result: MidsceneYamlConfigResult,
): MidsceneYamlConfigResult => {
  const attempts = readAttemptHistory(resultFile);
  const nextAttempts = [
    ...attempts,
    toAttemptResult(result, attempts.length + 1),
  ];

  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(
    attemptHistoryFileFor(resultFile),
    JSON.stringify(nextAttempts, null, 2),
  );

  return {
    ...result,
    attempts: nextAttempts,
  };
};

const createRuntimeFailureResult = (
  file: string,
  startTime: number,
  error: unknown,
): MidsceneYamlConfigResult => ({
  file,
  success: false,
  executed: true,
  duration: Date.now() - startTime,
  resultType: 'failed',
  error: errorMessageOf(error),
});

let rstestCorePromise: Promise<{ test: RstestTest }> | undefined;

const loadRstestTest = async (): Promise<RstestTest> => {
  if (!rstestCorePromise) {
    rstestCorePromise = import('@rstest/core');
  }
  return (await rstestCorePromise).test;
};

const registerYamlCaseTest = (
  test: RstestTest,
  options: DefineYamlCaseTestOptions,
) => {
  test(options.testName, async () => {
    const file = resolve(options.yamlFile);
    const startTime = Date.now();
    let result: MidsceneYamlConfigResult | undefined;

    try {
      result = await runYamlCaseResult({
        ...options.caseOptions,
        ...options.webRuntimeOptions,
        file,
      });
      result = appendAttemptHistory(options.resultFile, result);
      writeResultFile(options.resultFile, result);

      if (!result.success) {
        throw createYamlCaseFailure(result);
      }
    } catch (error) {
      if (!result) {
        const failureResult = appendAttemptHistory(
          options.resultFile,
          createRuntimeFailureResult(file, startTime, error),
        );
        writeResultFile(options.resultFile, failureResult);
      }
      throw error;
    }
  });
};

export function defineYamlCaseTest(
  test: RstestTest,
  options: DefineYamlCaseTestOptions,
): void;
export function defineYamlCaseTest(
  options: DefineYamlCaseTestOptions,
): Promise<void>;
export function defineYamlCaseTest(
  testOrOptions: RstestTest | DefineYamlCaseTestOptions,
  maybeOptions?: DefineYamlCaseTestOptions,
): void | Promise<void> {
  if (maybeOptions) {
    registerYamlCaseTest(testOrOptions as RstestTest, maybeOptions);
    return;
  }

  return loadRstestTest().then((test) => {
    registerYamlCaseTest(test, testOrOptions as DefineYamlCaseTestOptions);
  });
}

const registerYamlBatchTest = (
  test: RstestTest,
  options: DefineYamlBatchTestOptions,
) => {
  test(options.testName, async () => {
    await runYamlBatchInRstest({
      config: options.config,
      resultFiles: options.resultFiles,
    });
  });
};

export function defineYamlBatchTest(
  test: RstestTest,
  options: DefineYamlBatchTestOptions,
): void;
export function defineYamlBatchTest(
  options: DefineYamlBatchTestOptions,
): Promise<void>;
export function defineYamlBatchTest(
  testOrOptions: RstestTest | DefineYamlBatchTestOptions,
  maybeOptions?: DefineYamlBatchTestOptions,
): void | Promise<void> {
  if (maybeOptions) {
    registerYamlBatchTest(testOrOptions as RstestTest, maybeOptions);
    return;
  }

  return loadRstestTest().then((test) => {
    registerYamlBatchTest(test, testOrOptions as DefineYamlBatchTestOptions);
  });
}
