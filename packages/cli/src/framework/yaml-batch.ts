import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import {
  type BatchRunnerConfig,
  runYamlBatchWithCaseIds,
} from '../yaml-batch-executor';
import { emitYamlProgress } from './progress-reporter';

export interface RunYamlBatchInRstestOptions {
  config: BatchRunnerConfig;
  resultTargets: Array<{
    caseId: string;
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
  const resultTargetsByCaseId = new Map<
    string,
    RunYamlBatchInRstestOptions['resultTargets'][number]
  >();
  for (const target of options.resultTargets) {
    if (resultTargetsByCaseId.has(target.caseId)) {
      throw new Error(
        `Duplicate batch result target case ID: ${target.caseId}`,
      );
    }
    resultTargetsByCaseId.set(target.caseId, target);
  }

  const occurrenceResults = await runYamlBatchWithCaseIds(
    options.config,
    options.resultTargets.map(({ caseId }) => caseId),
    {
      generateSummary: false,
      printExecutionPlan: false,
      onProgress: emitYamlProgress,
    },
  );

  const unmappedResults: string[] = [];
  for (const { caseId, result } of occurrenceResults) {
    const target = resultTargetsByCaseId.get(caseId);
    if (!target || resolve(target.yamlFile) !== resolve(result.file)) {
      unmappedResults.push(caseId);
      continue;
    }
    writeResultFile(target.resultFile, result);
    resultTargetsByCaseId.delete(caseId);
  }

  const unwrittenTargets = Array.from(resultTargetsByCaseId.keys());
  if (unmappedResults.length || unwrittenTargets.length) {
    throw new Error(
      `Batch result mapping mismatch: ${unmappedResults.length} result(s) had no target and ${unwrittenTargets.length} target(s) had no result`,
    );
  }

  const results = occurrenceResults.map(({ result }) => result);
  if (results.some((result) => !result.success)) {
    throw new Error(batchFailureMessage(results));
  }

  return results;
}
