import type {
  CaseRunOutcome,
  WorkflowDocumentRunResult,
} from '../engine/types';
import type { WorkflowError } from '../errors';

export type ProjectCaseRunResult = CaseRunOutcome;

export interface WorkflowCollectionError {
  sourcePath: string;
  error: WorkflowError;
}

export interface WorkflowProjectRunSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  collectionErrors: number;
  documentFailures: number;
}

export interface WorkflowProjectRunResult {
  status: 'success' | 'failed';
  exitCode: 0 | 1;
  resultDir: string;
  summary: WorkflowProjectRunSummary;
  cases: readonly ProjectCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly WorkflowCollectionError[];
}
