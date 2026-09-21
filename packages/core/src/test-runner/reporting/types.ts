import type { TestRunReportSummary } from '../../test-run-report';
import type {
  CaseRunOutcome,
  ProjectRuntimeResult,
  WorkflowDocumentRunResult,
} from '../engine/types';

/** Minimal report input: no CLI options, filesystem paths or exit codes. */
export interface RunReportCaseInput extends CaseRunOutcome {
  documentId: string;
  /** Required when the same logical document has multiple invocations. */
  documentRunId?: string;
}

export interface RunReportProjectInput {
  projectId: string;
  name: string;
  platform?: string;
  status: 'success' | 'failed';
  retry: number;
  lifecycle?: ProjectRuntimeResult;
  cases: readonly RunReportCaseInput[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly { sourcePath: string; error: unknown }[];
}

export interface RunReportInput {
  runId: string;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  summary: TestRunReportSummary;
  projects: readonly RunReportProjectInput[];
  /** Run-level infrastructure errors that do not belong to a test action. */
  errors?: readonly unknown[];
}
