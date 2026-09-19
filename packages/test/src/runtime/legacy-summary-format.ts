import { relative } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import type { WorkflowPublicationError } from '@midscene/core/internal/test-runner';

// Legacy compatibility: keep summary JSON stable while both commands publish
// the new report format. Rendering is pure; callers own artifact publication.
export interface LegacyExecutionSummary {
  total: number;
  successful: number;
  failed: number;
  partialFailed: number;
  notExecuted: number;
  totalDuration: number;
}

export function getLegacyExecutionSummary(
  results: readonly MidsceneYamlConfigResult[],
): LegacyExecutionSummary {
  const count = (type: MidsceneYamlConfigResult['resultType']) =>
    results.filter((result) => result.resultType === type).length;
  return {
    total: results.length,
    successful: count('success'),
    failed: count('failed'),
    partialFailed: count('partialFailed'),
    notExecuted: count('notExecuted'),
    totalDuration: results.reduce(
      (sum, result) => sum + (result.duration || 0),
      0,
    ),
  };
}

export interface LegacyRetryReport {
  report?: string;
  error?: WorkflowPublicationError;
}

export function buildLegacySummaryData(
  results: readonly MidsceneYamlConfigResult[],
  outputDir: string,
  retryReports: readonly LegacyRetryReport[] = [],
  generatedAt = new Date().toLocaleString(),
) {
  const outputPath = (file: string) => {
    const path = relative(outputDir, file);
    return path.startsWith('.') ? path : `./${path}`;
  };
  return {
    summary: { ...getLegacyExecutionSummary(results), generatedAt },
    results: results.map((result, index) => {
      const retryReport = retryReports[index];
      return {
        script: relative(outputDir, result.file),
        success: result.success,
        resultType: result.resultType,
        output: result.output ? outputPath(result.output) : undefined,
        report: result.report ? relative(outputDir, result.report) : undefined,
        retryReport: retryReport?.report
          ? relative(outputDir, retryReport.report)
          : !retryReport?.error && result.retryReport
            ? relative(outputDir, result.retryReport)
            : undefined,
        ...(retryReport?.error
          ? { retryReportError: retryReport.error.toJSON() }
          : {}),
        attempts: result.attempts?.map((attempt) => ({
          attempt: attempt.attempt,
          success: attempt.success,
          resultType: attempt.resultType,
          output: attempt.output ? outputPath(attempt.output) : undefined,
          report: attempt.report
            ? relative(outputDir, attempt.report)
            : undefined,
          error: attempt.error,
          duration: attempt.duration,
          ...(attempt.publicationErrors
            ? { publicationErrors: attempt.publicationErrors }
            : {}),
          ...(attempt.observerErrors
            ? { observerErrors: attempt.observerErrors }
            : {}),
          ...(attempt.infrastructureErrors
            ? { infrastructureErrors: attempt.infrastructureErrors }
            : {}),
          ...(attempt.executionRecordFallback
            ? { executionRecordFallback: attempt.executionRecordFallback }
            : {}),
          ...(attempt.executionRecordPath
            ? { executionRecord: outputPath(attempt.executionRecordPath) }
            : {}),
        })),
        error: result.error,
        duration: result.duration,
        ...(result.publicationErrors
          ? { publicationErrors: result.publicationErrors }
          : {}),
        ...(result.observerErrors
          ? { observerErrors: result.observerErrors }
          : {}),
        ...(result.infrastructureErrors
          ? { infrastructureErrors: result.infrastructureErrors }
          : {}),
        ...(result.executionRecordFallback
          ? { executionRecordFallback: result.executionRecordFallback }
          : {}),
        ...(result.executionRecordPath
          ? { executionRecord: outputPath(result.executionRecordPath) }
          : {}),
      };
    }),
  };
}
