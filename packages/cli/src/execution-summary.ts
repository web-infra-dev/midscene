import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type {
  MidsceneYamlConfigResult,
  MidsceneYamlScriptEnv,
} from '@midscene/core';
import type { ScriptPlayer } from '@midscene/core/yaml';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

export interface ExecutionPlanConfig {
  files: string[];
  concurrent: number;
  continueOnError: boolean;
  summary: string;
  shareBrowserContext?: boolean;
  headed: boolean;
  keepWindow: boolean;
}

export interface ExecutionSummary {
  total: number;
  successful: number;
  failed: number;
  partialFailed: number;
  notExecuted: number;
  totalDuration: number;
}

type ResultType = MidsceneYamlConfigResult['resultType'];

export const notExecutedError = 'Not executed (previous task failed)';

export function createNotExecutedYamlResult(
  file: string,
): MidsceneYamlConfigResult {
  return {
    file,
    success: false,
    executed: false,
    output: undefined,
    report: undefined,
    duration: 0,
    resultType: 'notExecuted',
    error: notExecutedError,
  };
}

export function createExecutedYamlResult(options: {
  file: string;
  player: ScriptPlayer<MidsceneYamlScriptEnv>;
  duration: number;
}): MidsceneYamlConfigResult {
  const { file, player, duration } = options;
  const hasFailedTasks =
    player.taskStatusList?.some((task) => task.status === 'error') ?? false;
  const hasPlayerError = player.status === 'error';

  let success: boolean;
  let resultType: 'success' | 'failed' | 'partialFailed';

  if (hasPlayerError) {
    success = false;
    resultType = 'failed';
  } else if (hasFailedTasks) {
    success = false;
    resultType = 'partialFailed';
  } else {
    success = true;
    resultType = 'success';
  }

  let outputPath: string | undefined = player.output || undefined;
  if (outputPath && !existsSync(outputPath)) {
    outputPath = undefined;
  }

  let errorMessage: string | undefined;
  if (player.errorInSetup?.message) {
    errorMessage = player.errorInSetup.message;
  } else if (hasPlayerError || hasFailedTasks) {
    const taskErrors = player.taskStatusList
      ?.filter((task) => task.status === 'error' && task.error?.message)
      .map((task) => task.error!.message);
    if (taskErrors && taskErrors.length > 0) {
      errorMessage = taskErrors.join('; ');
    } else if (hasPlayerError) {
      errorMessage = 'Execution failed';
    } else {
      errorMessage = 'Some tasks failed';
    }
  }

  return {
    file,
    success,
    executed: true,
    output: outputPath,
    report: player.reportFile || undefined,
    duration,
    resultType,
    error: errorMessage,
  };
}

export function getExecutionSummary(
  results: MidsceneYamlConfigResult[],
): ExecutionSummary {
  return {
    total: results.length,
    successful: getResultsByType(results, 'success').length,
    failed: getResultsByType(results, 'failed').length,
    partialFailed: getResultsByType(results, 'partialFailed').length,
    notExecuted: getResultsByType(results, 'notExecuted').length,
    totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
  };
}

export function getResultsByType(
  results: MidsceneYamlConfigResult[],
  resultType: ResultType,
): MidsceneYamlConfigResult[] {
  return results.filter((result) => result.resultType === resultType);
}

export function getResultFilesByType(
  results: MidsceneYamlConfigResult[],
  resultType: ResultType,
): string[] {
  return getResultsByType(results, resultType).map((result) => result.file);
}

export function getSummaryAbsolutePath(summary: string): string {
  return resolve(getMidsceneRunSubDir('output'), summary);
}

export function writeExecutionSummaryFile(
  summary: string,
  results: MidsceneYamlConfigResult[],
): string {
  const indexPath = getSummaryAbsolutePath(summary);
  const outputDir = dirname(indexPath);
  mkdirSync(outputDir, { recursive: true });

  const executionSummary = getExecutionSummary(results);
  const indexData = {
    summary: {
      ...executionSummary,
      generatedAt: new Date().toLocaleString(),
    },
    results: results.map((result) => ({
      script: relative(outputDir, result.file),
      success: result.success,
      resultType: result.resultType,
      output: result.output
        ? (() => {
            const relativePath = relative(outputDir, result.output);
            return relativePath.startsWith('.')
              ? relativePath
              : `./${relativePath}`;
          })()
        : undefined,
      report: result.report ? relative(outputDir, result.report) : undefined,
      error: result.error,
      duration: result.duration,
    })),
  };

  writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  return indexPath;
}

export function printExecutionPlan(config: ExecutionPlanConfig): void {
  console.log('   Scripts:');
  for (const file of config.files) {
    console.log(`     - ${file}`);
  }
  console.log('📋 Execution plan');
  console.log(`   Concurrency: ${config.concurrent}`);
  console.log(`   Keep window: ${config.keepWindow}`);
  console.log(`   Headed: ${config.headed}`);
  console.log(`   Continue on error: ${config.continueOnError}`);
  console.log(
    `   Share browser context: ${config.shareBrowserContext ?? false}`,
  );
  console.log(`   Summary output: ${config.summary}`);
}

export function printExecutionFinished(): void {
  console.log('Execution finished:');
}

export function printExecutionSummary(
  results: MidsceneYamlConfigResult[],
  summaryPath: string,
): boolean {
  const summary = getExecutionSummary(results);
  const successfulFiles = getResultsByType(results, 'success');
  const failedFiles = getResultsByType(results, 'failed');
  const partialFailedFiles = getResultsByType(results, 'partialFailed');
  const notExecutedFiles = getResultsByType(results, 'notExecuted');
  const success =
    summary.failed === 0 &&
    summary.partialFailed === 0 &&
    summary.notExecuted === 0;

  console.log('\n📊 Execution Summary:');
  console.log(`   Total files: ${summary.total}`);
  console.log(`   Successful: ${summary.successful}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Partial failed: ${summary.partialFailed}`);
  console.log(`   Not executed: ${summary.notExecuted}`);
  console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
  console.log(`   Summary: ${summaryPath}`);

  if (successfulFiles.length > 0) {
    console.log('\n✅ Successful files:');
    successfulFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (failedFiles.length > 0) {
    console.log('\n❌ Failed files');
    failedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
  }

  if (partialFailedFiles.length > 0) {
    console.log(
      '\n⚠️  Partial failed files (some tasks failed with continueOnError)',
    );
    partialFailedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
  }

  if (notExecutedFiles.length > 0) {
    console.log('\n⏸️ Not executed files');
    notExecutedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (success) {
    console.log('\n🎉 All files executed successfully!');
  } else {
    console.log('\n⚠️ Some files failed or were not executed.');
  }

  return success;
}
