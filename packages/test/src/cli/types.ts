import type {
  CaseRunOutcome,
  WorkflowDocumentRunResult,
} from '../engine/types';
import type { WorkflowError } from '../errors';

export type TestProjectCaseRunResult = CaseRunOutcome;

export interface TestProjectCollectionError {
  sourcePath: string;
  error: WorkflowError;
}

export interface TestProjectRunSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  collectionErrors: number;
  documentFailures: number;
}

export interface TestProjectRunResult {
  status: 'success' | 'failed';
  exitCode: 0 | 1;
  resultDir: string;
  summary: TestProjectRunSummary;
  cases: readonly TestProjectCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly TestProjectCollectionError[];
}
