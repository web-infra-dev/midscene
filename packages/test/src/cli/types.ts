import type {
  CaseRunOutcome,
  ProjectRuntimeResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import type { WorkflowError } from '../errors';
import type { TestCaseArtifact } from './test-executor';
import type { TestFileSelection, TestTagSelection } from './test-project';

export type TestProjectCaseRunResult = CaseRunOutcome & {
  documentId: string;
  execution?: {
    executor: string;
    resources: readonly string[];
    lifecycle?: ProjectRuntimeResult;
    artifacts?: readonly TestCaseArtifact[];
    metadata?: Readonly<Record<string, string | number | boolean | null>>;
    attempts?: number;
    failure?: {
      kind: 'provision' | 'transport' | 'cleanup' | 'report' | 'unknown';
      message: string;
      retryable: boolean;
    };
  };
};

export interface TestProjectCollectionError {
  projectId: string;
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
  projectId: string;
  name: string;
  status: 'success' | 'failed';
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
  schemaVersion: 3;
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: 'success' | 'failed';
  exitCode: 0 | 1;
  resultDir: string;
  summaryPath: string;
  reportDir: string;
  /** Absolute path to the unified Midscene Test HTML report. */
  reportPath?: string;
  summary: TestProjectRunSummary;
  projects: readonly TestExecutionProjectRunResult[];
  cases: readonly TestProjectCaseRunResult[];
  documents: readonly WorkflowDocumentRunResult[];
  collectionErrors: readonly TestProjectCollectionError[];
}
