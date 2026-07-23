import type {
  CaseRunOutcome,
  ProjectRuntimeResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import type { WorkflowError } from '../errors';
import type {
  TestFileSelection,
  TestPlatform,
  TestTagSelection,
} from './test-project';

export type TestProjectCaseRunResult = CaseRunOutcome;

export interface TestProjectCollectionError {
  projectName: string;
  sourcePath: string;
  error: WorkflowError;
}

export interface TestProjectRunSummary {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  filtered: number;
  collectionErrors: number;
  documentFailures: number;
  projectFailures: number;
}

export interface TestExecutionProjectRunResult {
  name: string;
  platform: TestPlatform;
  status: 'success' | 'failed';
  repeat: number;
  retry: number;
  fileSelection: TestFileSelection;
  tagSelection: Readonly<Required<TestTagSelection>>;
  sourceCount: number;
  selectedCaseCount: number;
  filteredCaseCount: number;
  lifecycle?: ProjectRuntimeResult;
  cases: readonly TestProjectCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly TestProjectCollectionError[];
}

export interface TestProjectRunResult {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  exitCode: 0 | 1;
  resultDir: string;
  summaryPath: string;
  reportDir: string;
  summary: TestProjectRunSummary;
  projects: readonly TestExecutionProjectRunResult[];
  cases: readonly TestProjectCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly TestProjectCollectionError[];
}
