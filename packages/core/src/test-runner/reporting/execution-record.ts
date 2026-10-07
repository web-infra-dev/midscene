import {
  type WorkflowExecutionRecord,
  executionRecordToResult,
} from '../execution-record';
import type { RunReportInput, RunReportProjectInput } from './types';

/** Project complete invocations without changing their legacy/API state. */
export function executionRecordsToReportInput(
  records: readonly WorkflowExecutionRecord[],
  options: { runId: string; startedAt?: string; endedAt?: string },
): RunReportInput {
  if (records.length === 0)
    throw new Error('A report requires at least one execution record.');
  const grouped = new Map<string, WorkflowExecutionRecord[]>();
  for (const record of records) {
    const key = record.document.projectId;
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  };
  const projects: RunReportProjectInput[] = [];
  for (const [projectId, group] of grouped) {
    const platform = group[0].platform;
    const name = group[0].projectName ?? platform;
    const latest = new Map<string, WorkflowExecutionRecord>();
    const currentInvocation = new Map<string, string>();
    for (const record of group) {
      const documentId = record.document.documentId;
      if (record.attemptIndex === 0 || !currentInvocation.has(documentId))
        currentInvocation.set(documentId, record.runId);
      latest.set(currentInvocation.get(documentId)!, record);
    }
    for (const record of latest.values()) {
      const outcomes = record.execution?.cases;
      summary.total += record.document.cases.length;
      summary.passed +=
        outcomes?.filter((item) => item.status === 'success').length ?? 0;
      summary.failed +=
        outcomes?.filter((item) => item.status === 'failed').length ?? 0;
      summary.notRun +=
        outcomes?.filter((item) => item.status === 'not-run').length ??
        record.document.cases.length;
      if (
        record.setupError !== undefined ||
        record.executionError !== undefined ||
        record.reportError !== undefined ||
        (record.publicationErrors?.length ?? 0) > 0 ||
        (record.observerErrors?.length ?? 0) > 0 ||
        record.cleanupErrors.length ||
        record.execution?.document.status === 'failed'
      )
        summary.documentFailures += 1;
    }
    const results = group.map(executionRecordToResult);
    const documents = results.map((result) => result.document);
    projects.push({
      projectId,
      name,
      platform,
      status: [...latest.values()].some((record) => record.status === 'failed')
        ? 'failed'
        : 'success',
      retry: Math.max(...group.map((record) => record.attemptIndex)),
      documents,
      collectionErrors: [],
      cases: results.flatMap((result) =>
        result.cases.map((outcome) => ({
          ...outcome,
          documentId: result.document.documentId,
          documentRunId: result.document.documentRunId,
        })),
      ),
    });
  }
  const startedAt =
    options.startedAt ?? records.map((record) => record.startedAt).sort()[0];
  const endedAt =
    options.endedAt ??
    records
      .map((record) => record.endedAt)
      .sort()
      .at(-1)!;
  return {
    runId: options.runId,
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
    status: projects.some((project) => project.status === 'failed')
      ? 'failed'
      : 'success',
    summary,
    projects,
  };
}
