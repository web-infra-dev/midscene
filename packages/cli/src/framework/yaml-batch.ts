import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { type BatchRunnerConfig, runYamlBatch } from '../yaml-batch-executor';

export interface RunYamlBatchInRstestOptions {
  config: BatchRunnerConfig;
  resultFiles: Record<string, string>;
}

const writeResultFile = (
  resultFile: string,
  data: MidsceneYamlConfigResult,
) => {
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(data, null, 2));
};

const batchFailureMessage = (results: MidsceneYamlConfigResult[]): string => {
  const failed = results.filter((result) => !result.success);
  return failed
    .map((result) => `${result.file}: ${result.error || result.resultType}`)
    .join('\n');
};

export async function runYamlBatchInRstest(
  options: RunYamlBatchInRstestOptions,
): Promise<MidsceneYamlConfigResult[]> {
  const results = await runYamlBatch(options.config, {
    generateSummary: false,
    printExecutionPlan: false,
  });

  for (const result of results) {
    const resultFile =
      options.resultFiles[result.file] ||
      options.resultFiles[resolve(result.file)];
    if (resultFile) {
      writeResultFile(resultFile, result);
    }
  }

  if (results.some((result) => !result.success)) {
    throw new Error(batchFailureMessage(results));
  }

  return results;
}
