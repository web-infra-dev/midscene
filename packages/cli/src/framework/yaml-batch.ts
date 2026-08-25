import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { type BatchRunnerConfig, runYamlBatch } from '../yaml-batch-executor';
import { emitYamlProgress } from './progress-reporter';

export interface RunYamlBatchInRstestOptions {
  config: BatchRunnerConfig;
  resultTargets: Array<{
    yamlFile: string;
    resultFile: string;
  }>;
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
    onProgress: emitYamlProgress,
  });

  const resultFileQueues = new Map<string, string[]>();
  for (const target of options.resultTargets) {
    const yamlFile = resolve(target.yamlFile);
    const queue = resultFileQueues.get(yamlFile) ?? [];
    queue.push(target.resultFile);
    resultFileQueues.set(yamlFile, queue);
  }

  const unmappedResults: string[] = [];
  for (const result of results) {
    const resultFile = resultFileQueues.get(resolve(result.file))?.shift();
    if (!resultFile) {
      unmappedResults.push(result.file);
      continue;
    }
    writeResultFile(resultFile, result);
  }

  const unwrittenTargets = Array.from(resultFileQueues.entries()).flatMap(
    ([yamlFile, queue]) => queue.map(() => yamlFile),
  );
  if (unmappedResults.length || unwrittenTargets.length) {
    throw new Error(
      `Batch result mapping mismatch: ${unmappedResults.length} result(s) had no target and ${unwrittenTargets.length} target(s) had no result`,
    );
  }

  if (results.some((result) => !result.success)) {
    throw new Error(batchFailureMessage(results));
  }

  return results;
}
