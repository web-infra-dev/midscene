import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
} from '@midscene/core';
import type { test as rstestTest } from '@rstest/core';
import type { BatchRunnerConfig } from '../batch-runner';
import {
  createYamlAttempt,
  resolveYamlMaxAttempts,
} from '../execution-summary';
import { contextTaskListSummary, formatYamlProgressSnapshot } from '../printer';
import { emitYamlProgress } from './progress-reporter';
import { runYamlBatchInRstest } from './yaml-batch';
import {
  type RunYamlCaseOptions,
  type YamlPlayerSnapshotHandler,
  createYamlCaseFailure,
  runYamlCaseResultWithSnapshots,
} from './yaml-case';

export type RstestTest = typeof rstestTest;

export interface DefineYamlCaseTestOptions {
  testName: string;
  yamlFile: string;
  resultFile: string;
  retry?: number;
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

const appendAttemptHistory = (
  resultFile: string,
  result: MidsceneYamlConfigResult,
): MidsceneYamlConfigResult => {
  const attempts = readAttemptHistory(resultFile);
  const nextAttempts = [
    ...attempts,
    createYamlAttempt(result, attempts.length + 1),
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

const createYamlPlayerProgressReporter =
  (attempt: number, totalAttempts: number): YamlPlayerSnapshotHandler =>
  ({ file, player }) => {
    const summary = contextTaskListSummary(player.taskStatusList, {
      file,
      player,
    });
    emitYamlProgress(
      formatYamlProgressSnapshot(summary, attempt, totalAttempts),
    );
  };

export const defineYamlCaseTest = (
  test: RstestTest,
  options: DefineYamlCaseTestOptions,
) => {
  test(options.testName, async () => {
    const file = resolve(options.yamlFile);
    const startTime = Date.now();
    const attempt = readAttemptHistory(options.resultFile).length + 1;
    const totalAttempts = resolveYamlMaxAttempts(options.retry);
    let result: MidsceneYamlConfigResult | undefined;

    try {
      result = await runYamlCaseResultWithSnapshots(
        {
          ...options.caseOptions,
          ...options.webRuntimeOptions,
          file,
        },
        createYamlPlayerProgressReporter(attempt, totalAttempts),
      );
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

export const defineYamlBatchTest = (
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
