import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
} from '@midscene/core';
import {
  WorkflowExecutionFailure,
  type WorkflowExecutionRecord,
  WorkflowPublicationError,
  serializeWorkflowValue,
} from '@midscene/core/internal/test-runner';
import {
  getMidsceneRunDir,
  getMidsceneRunSubDir,
} from '@midscene/shared/common';
import { buildLegacySummaryData } from '../runtime/legacy-summary-format';
import type { TestProjectRunResult } from './types';

export interface LegacySummaryArtifact {
  runId: string;
  outputPath?: string;
  reportPath?: string;
  executionRecordPath?: string;
}

export interface LegacySummaryOccurrence {
  file: string;
  projectId: string;
  documentId?: string;
  artifacts?: readonly LegacySummaryArtifact[];
}

const messageOf = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);

function legacyAttempt(
  record: WorkflowExecutionRecord,
  artifacts: LegacySummaryArtifact | undefined,
  recordPath: string,
): MidsceneYamlConfigAttempt {
  const failures =
    record.execution?.cases.filter((item) => item.status === 'failed') ?? [];
  const stoppedOnFailure = failures.some(
    (outcome) =>
      record.document.cases.find((item) => item.caseIndex === outcome.caseIndex)
        ?.definition.onFailure === 'stop-document',
  );
  const infrastructureErrors = [
    ...(record.reportError === undefined ? [] : [record.reportError]),
    ...record.cleanupErrors,
  ];
  const failed =
    record.setupError !== undefined ||
    record.executionError !== undefined ||
    infrastructureErrors.length > 0 ||
    !!record.publicationErrors?.length ||
    !!record.observerErrors?.length ||
    stoppedOnFailure ||
    (record.execution?.document.status === 'failed' && failures.length === 0);
  const resultType =
    record.status === 'success'
      ? 'success'
      : !failed && failures.length > 0
        ? 'partialFailed'
        : 'failed';
  const actionErrors = failures.flatMap((outcome) => {
    const run = outcome.run;
    if (!run) return [];
    return [...run.beforeEach, ...run.steps, ...run.afterEach].flatMap(
      (step) => (step.error ? [step.error] : []),
    );
  });
  const errors = [
    ...(record.setupError === undefined ? [] : [record.setupError]),
    ...(record.executionError === undefined ? [] : [record.executionError]),
    ...actionErrors,
    ...infrastructureErrors,
    ...(record.publicationErrors ?? []),
    ...(record.observerErrors ?? []),
  ];
  const executionRecordPath = artifacts?.executionRecordPath ?? recordPath;
  return {
    attempt: record.attemptIndex + 1,
    success: resultType === 'success',
    resultType,
    output:
      artifacts?.outputPath && existsSync(artifacts.outputPath)
        ? artifacts.outputPath
        : undefined,
    report: artifacts?.reportPath ?? record.reportPaths.at(-1),
    duration: record.durationMs,
    ...(resultType === 'success'
      ? {}
      : {
          error: errors.length
            ? [...new Set(errors.map(messageOf))].join('; ')
            : 'Execution failed',
        }),
    ...(existsSync(executionRecordPath)
      ? { executionRecordPath }
      : { executionRecordFallback: record }),
    ...(record.publicationErrors?.length
      ? { publicationErrors: record.publicationErrors }
      : {}),
    ...(record.observerErrors?.length
      ? { observerErrors: record.observerErrors }
      : {}),
    ...(infrastructureErrors.length ? { infrastructureErrors } : {}),
  };
}

/** Legacy result projection only: execution and retry ownership remain in Test. */
export function buildLegacyYamlResults(
  result: TestProjectRunResult,
  occurrences: readonly LegacySummaryOccurrence[],
): MidsceneYamlConfigResult[] {
  const projects = new Map(
    result.projects.map((project) => [project.projectId, project]),
  );
  return occurrences.map((occurrence) => {
    const project = projects.get(occurrence.projectId);
    if (!project)
      throw new Error(
        `Missing Test execution project: ${occurrence.projectId}`,
      );
    const records = (project.executionRecords ?? []).filter(
      (record) =>
        !occurrence.documentId ||
        record.document.documentId === occurrence.documentId,
    );
    if (records.length === 0) {
      const errors = project.collectionErrors.map((item) => item.error);
      return {
        file: occurrence.file,
        success: false,
        executed: false,
        duration: 0,
        resultType: errors.length ? 'failed' : 'notExecuted',
        error: errors.length
          ? errors.map(messageOf).join('; ')
          : 'Not executed (previous task failed)',
      };
    }
    const artifacts = new Map(
      occurrence.artifacts?.map((artifact) => [artifact.runId, artifact]),
    );
    const attempts = records.map((record) =>
      legacyAttempt(
        record,
        artifacts.get(record.runId),
        join(
          dirname(result.summaryPath),
          project.projectId,
          'execution-records',
          `${record.runId}.json`,
        ),
      ),
    );
    if (result.reportPath)
      for (const attempt of attempts.slice(0, -1))
        attempt.report = result.reportPath;
    const { attempt: _attempt, ...last } = attempts.at(-1)!;
    return {
      ...last,
      file: occurrence.file,
      executed: true,
      attempts,
      duration: attempts.reduce(
        (total, attempt) => total + (attempt.duration ?? 0),
        0,
      ),
      ...(attempts.length > 1 && result.reportPath
        ? { retryReport: result.reportPath }
        : {}),
    };
  });
}

export async function writeLegacyTestSummary(
  summary: string,
  result: TestProjectRunResult,
  occurrences: readonly LegacySummaryOccurrence[],
): Promise<string> {
  let path = resolve(getMidsceneRunDir(), 'output', summary);
  try {
    const results = buildLegacyYamlResults(result, occurrences);
    path = resolve(getMidsceneRunSubDir('output'), summary);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      serializeWorkflowValue(buildLegacySummaryData(results, dirname(path))),
    );
    return path;
  } catch (error) {
    throw new WorkflowExecutionFailure(result, [
      new WorkflowPublicationError('write-result', path, error),
    ]);
  }
}
