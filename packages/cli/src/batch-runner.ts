import type { MidsceneYamlConfigResult } from '@midscene/core';
import {
  type ExecutionSummary,
  getExecutionSummary,
  getResultFilesByType,
  getSummaryAbsolutePath,
  printExecutionSummary,
} from './execution-summary';
import { isYamlBatchExecutionError } from './yaml-batch-error';
import {
  type BatchRunnerConfig,
  type RunYamlBatchOptions,
  runYamlBatch,
} from './yaml-batch-executor';

class BatchRunner {
  private results: MidsceneYamlConfigResult[] = [];

  constructor(private config: BatchRunnerConfig) {}

  async run(
    options: RunYamlBatchOptions = {},
  ): Promise<MidsceneYamlConfigResult[]> {
    this.results = [];
    try {
      this.results = await runYamlBatch(this.config, options);
      return this.results;
    } catch (error) {
      if (isYamlBatchExecutionError(error)) {
        this.results = [...error.results];
      }
      throw error;
    }
  }

  getExecutionSummary(): ExecutionSummary {
    return getExecutionSummary(this.results);
  }

  getFailedFiles(): string[] {
    return getResultFilesByType(this.results, 'failed');
  }

  getPartialFailedFiles(): string[] {
    return getResultFilesByType(this.results, 'partialFailed');
  }

  getNotExecutedFiles(): string[] {
    return getResultFilesByType(this.results, 'notExecuted');
  }

  getSuccessfulFiles(): string[] {
    return getResultFilesByType(this.results, 'success');
  }

  getResults(): MidsceneYamlConfigResult[] {
    return [...this.results];
  }

  printExecutionSummary(): boolean {
    return printExecutionSummary(
      this.results,
      getSummaryAbsolutePath(this.config.summary),
    );
  }
}

export { BatchRunner };
export type { BatchRunnerConfig, RunYamlBatchOptions };
