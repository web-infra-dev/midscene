import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { test } from '@rstest/core';
import type { BatchRunnerConfig } from '../batch-runner';
import { runYamlBatchInRstest } from './yaml-batch';
import {
  type RunYamlCaseOptions,
  createYamlCaseFailure,
  runYamlCaseResult,
} from './yaml-case';

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

export function defineYamlCaseTest(options: DefineYamlCaseTestOptions) {
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
      writeResultFile(options.resultFile, result);

      if (!result.success && result.resultType !== 'partialFailed') {
        throw createYamlCaseFailure(result);
      }
    } catch (error) {
      if (!result) {
        writeResultFile(
          options.resultFile,
          createRuntimeFailureResult(file, startTime, error),
        );
      }
      throw error;
    }
  });
}

export function defineYamlBatchTest(options: DefineYamlBatchTestOptions) {
  test(options.testName, async () => {
    await runYamlBatchInRstest({
      config: options.config,
      resultFiles: options.resultFiles,
    });
  });
}
