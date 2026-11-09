import type {
  CollectedWorkflowDocument,
  RunWorkflowDocumentOptions,
  WorkflowDocumentSource,
} from '@midscene/core/internal/test-runner';
import type { TestReporterEvent } from './reporter-events';
import type {
  LoadedExecutionProject,
  LoadedTestProject,
  TestFileSelection,
} from './test-project';
import type { TestProjectCollectionError, TestProjectRunResult } from './types';

export interface TestProjectRunOptions {
  cwd?: string;
  /** SDK project directory for default config discovery; defaults to cwd. */
  projectRoot?: string;
  /** File or directory filter, resolved relative to cwd. */
  testPath?: string;
  /** Config path relative to cwd; its directory becomes the project root. */
  configPath?: string;
  resultDir?: string;
  projectNames?: readonly string[];
  onProgress?(message: string): void;
  onEvent?(event: TestReporterEvent): void;
}

/** Private, syntax-independent contract between preparation and execution. */
export interface PreparedDocumentInvocation {
  plan?: import('@midscene/core').TestRunReportDocumentPlan;
  document: CollectedWorkflowDocument;
  retry: { scope: 'case' | 'document'; count: number };
  defaultTimeoutMs?: number;
  reportEnabled: boolean;
  bindings: Pick<
    RunWorkflowDocumentOptions<any>,
    | 'resolveNode'
    | 'documentSetup'
    | 'onStepResult'
    | 'resolveCaseReportScopeId'
  >;
}

export interface ProjectPreparationOptions {
  /** Standalone input discovery does not change the project/artifact root. */
  discoveryRoot?: string;
  files?: readonly string[];
  testPath?: string;
  excludedDirectories?: readonly string[];
  prerequisiteFile?: string;
  documentConcurrency?: number;
  platform?: string;
  collectDocument?(
    source: WorkflowDocumentSource,
    project: LoadedExecutionProject,
  ): Promise<
    | {
        invocation?: PreparedDocumentInvocation;
        filteredCaseCount: number;
      }
    | undefined
  >;
}

export interface PreparedExecutionProject {
  project: LoadedExecutionProject;
  platform?: string;
  documentConcurrency: number;
  prerequisiteDocumentId?: string;
  fileSelection: TestFileSelection;
  sources: readonly WorkflowDocumentSource[];
  documents: readonly CollectedWorkflowDocument[];
  plans?: readonly import('@midscene/core').TestRunReportDocumentPlan[];
  invocations: readonly PreparedDocumentInvocation[];
  collectionErrors: readonly TestProjectCollectionError[];
  selectedCaseCount: number;
  filteredCaseCount: number;
}

/** Hosts publish extra artifacts before the final Test summary is written. */
export interface PreparedRunPublication {
  operation: 'write-result' | 'write-report';
  path: string;
  publish(result: TestProjectRunResult): void | Promise<void>;
}

export interface TestRunInput {
  cwd: string;
  projectRoot: string;
  configPath?: string;
  testPath?: string;
}

export interface PreparedTestRunPlan {
  startedAt: Date;
  runId: string;
  projectRoot: string;
  artifactDir: string;
  configPath?: string;
  resultDir: string;
  runDir: string;
  summaryPath: string;
  reportDir: string;
  definition: LoadedTestProject<unknown>;
  projects: readonly PreparedExecutionProject[];
  preflightScope: 'project' | 'run';
  reportEnabled: boolean;
  publications: readonly PreparedRunPublication[];
  onProgress(message: string): void;
  onEvent?(event: TestReporterEvent): void;
}
