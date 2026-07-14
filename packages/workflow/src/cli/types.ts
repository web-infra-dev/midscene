import type {
  WorkflowDocumentRunResult,
  WorkflowRunResult,
} from '../engine/types';
import type { WorkflowError } from '../errors';

export type WorkflowCaseStatus = 'success' | 'failed' | 'not-run';

export interface WorkflowCaseRunResult {
  testId: string;
  name: string;
  sourcePath: string;
  workflowIndex: number;
  status: WorkflowCaseStatus;
  run?: WorkflowRunResult;
  notRunReason?: 'document-start-failed' | 'interrupted';
}

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
  workflows: readonly WorkflowCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly WorkflowCollectionError[];
}
