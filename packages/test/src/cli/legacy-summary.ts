import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
} from '@midscene/core';
import type { CaseRunOutcome } from '@midscene/core/internal/test-runner';
import {
  WorkflowExecutionFailure,
  WorkflowPublicationError,
  serializeWorkflowValue,
} from '@midscene/core/internal/test-runner';
import {
  getMidsceneRunDir,
  getMidsceneRunSubDir,
} from '@midscene/shared/common';
import { buildLegacySummaryData } from '../runtime/legacy-summary-format';
import type { TestProjectCaseRunResult, TestProjectRunResult } from './types';

export interface LegacySummaryArtifact {
  documentRunId: string;
  outputPath?: string;
  reportPath?: string;
}

export interface LegacySummaryOccurrence {
  file: string;
  projectId: string;
  documentId?: string;
  reportEnabled: boolean;
  artifacts?: readonly LegacySummaryArtifact[];
}

const messageOf = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);

const caseErrors = (outcome: TestProjectCaseRunResult): unknown[] =>
  (outcome.attempts ?? (outcome.run ? [outcome.run] : [])).flatMap((run) => [
    ...run.beforeEach.flatMap((step) => (step.error ? [step.error] : [])),
    ...run.steps.flatMap((step) => (step.error ? [step.error] : [])),
    ...run.afterEach.flatMap((step) => (step.error ? [step.error] : [])),
    ...(run.executionErrors ?? []),
    ...(run.teardownErrors ?? []),
  ]);

function legacyAttempt(
  document: TestProjectRunResult['documents'][number],
  outcomes: readonly TestProjectCaseRunResult[],
  artifact: LegacySummaryArtifact | undefined,
): MidsceneYamlConfigAttempt {
  const failedCases = outcomes.filter((item) => item.status === 'failed');
  const infrastructureErrors = [
    ...(document.hostErrors ?? []).map((item) => item.error),
    ...(document.executionErrors ?? []),
    ...(document.teardownErrors ?? []),
    ...outcomes.flatMap((outcome) =>
      (outcome.attempts ?? []).flatMap((attempt) => [
        ...(attempt.executionErrors ?? []),
        ...(attempt.teardownErrors ?? []),
      ]),
    ),
  ];
  const stoppedOnFailure = failedCases.some(
    (outcome) => (outcome as CaseRunOutcome).onFailure === 'stop-document',
  );
  const resultType =
    document.status === 'success' && failedCases.length === 0
      ? 'success'
      : !stoppedOnFailure &&
          failedCases.length > 0 &&
          infrastructureErrors.length === 0
        ? 'partialFailed'
        : 'failed';
  const errors = [...failedCases.flatMap(caseErrors), ...infrastructureErrors];
  return {
    attempt: (document.attemptIndex ?? 0) + 1,
    success: resultType === 'success',
    resultType,
    output:
      artifact?.outputPath && existsSync(artifact.outputPath)
        ? artifact.outputPath
        : undefined,
    report: artifact?.reportPath ?? document.reportPaths?.at(-1),
    duration: document.durationMs,
    ...(resultType === 'success'
      ? {}
      : {
          error: errors.length
            ? [...new Set(errors.map(messageOf))].join('; ')
            : 'Execution failed',
        }),
    ...(infrastructureErrors.length ? { infrastructureErrors } : {}),
  };
}

/** Project the old summary shape from standard document and case results. */
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
    const documents = project.documents.filter(
      (document) =>
        !occurrence.documentId || document.documentId === occurrence.documentId,
    );
    if (documents.length === 0) {
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
      occurrence.artifacts?.map((artifact) => [
        artifact.documentRunId,
        artifact,
      ]),
    );
    const attempts = documents.map((document) =>
      legacyAttempt(
        document,
        project.cases.filter(
          (item) =>
            item.documentId === document.documentId &&
            item.documentRunId === document.documentRunId,
        ),
        artifacts.get(document.documentRunId),
      ),
    );
    // The Test run report is the canonical user-facing report for both the new
    // command and its legacy YAML summary projection. Per-document Agent
    // reports remain available as execution artifacts in the Test result.
    for (const attempt of attempts) {
      if (!occurrence.reportEnabled) attempt.report = undefined;
      else if (result.reportPath) attempt.report = result.reportPath;
    }
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
      ...(attempts.length > 1 && last.report && result.reportPath
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
