import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { WorkflowRunResult } from '../engine/types';

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};

export const writeWorkflowRunResult = (
  resultDir: string,
  result: WorkflowRunResult,
) => {
  writeJson(
    join(resultDir, 'runs', result.testId, `${result.runId}.json`),
    result,
  );
};

export const writeCollectionError = (
  resultDir: string,
  sourcePath: string,
  error: unknown,
) => {
  const id = createHash('sha256').update(sourcePath).digest('hex');
  writeJson(join(resultDir, 'collection-errors', `${id}.json`), {
    kind: 'collection-error',
    sourcePath,
    error: error instanceof Error ? error.message : String(error),
  });
};

export const writeRstestTestMapping = (
  resultDir: string,
  rstestTestId: string,
  workflowTestId: string,
) => {
  const fileId = createHash('sha256').update(rstestTestId).digest('hex');
  writeJson(join(resultDir, 'rstest-tests', `${fileId}.json`), {
    rstestTestId,
    workflowTestId,
  });
};
