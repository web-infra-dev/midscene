import type { MidsceneYamlConfigResult } from '@midscene/core';

const normalizeBatchError = (error: unknown): Error =>
  error instanceof Error
    ? error
    : new Error('Unexpected YAML execution failure', { cause: error });

export class YamlBatchExecutionError extends Error {
  readonly results: MidsceneYamlConfigResult[];

  constructor(error: unknown, results: MidsceneYamlConfigResult[]) {
    const cause = normalizeBatchError(error);
    super(cause.message, { cause });
    this.name = 'YamlBatchExecutionError';
    this.results = [...results];
  }
}

export function isYamlBatchExecutionError(
  error: unknown,
): error is YamlBatchExecutionError {
  return error instanceof YamlBatchExecutionError;
}
