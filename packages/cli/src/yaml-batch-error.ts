import type { MidsceneYamlConfigResult } from '@midscene/core';

export interface YamlBatchErrorOccurrence {
  caseId: string;
  result: MidsceneYamlConfigResult;
}

const normalizeBatchError = (error: unknown): Error =>
  error instanceof Error
    ? error
    : new Error('Unexpected YAML execution failure', { cause: error });

export class YamlBatchExecutionError extends Error {
  readonly results: MidsceneYamlConfigResult[];
  readonly occurrences: YamlBatchErrorOccurrence[];

  constructor(error: unknown, occurrences: YamlBatchErrorOccurrence[]) {
    const cause = normalizeBatchError(error);
    super(cause.message, { cause });
    this.name = 'YamlBatchExecutionError';
    this.occurrences = occurrences.map(({ caseId, result }) => ({
      caseId,
      result,
    }));
    this.results = this.occurrences.map(({ result }) => result);
  }
}

export function isYamlBatchExecutionError(
  error: unknown,
): error is YamlBatchExecutionError {
  return error instanceof YamlBatchExecutionError;
}
