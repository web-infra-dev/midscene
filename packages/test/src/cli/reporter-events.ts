import type {
  CaseRunOutcome,
  CaseRunResult,
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import type { TestExecutionProjectRunResult } from './types';

/** Structured presentation facts; execution and persistence do not depend on a reporter. */
export type TestReporterEvent =
  | { type: 'project-end'; project: TestExecutionProjectRunResult }
  | {
      type: 'project-phase';
      projectName: string;
      phase: 'setup' | 'running' | 'teardown';
    }
  | {
      type: 'run-start';
      projects: number;
      documents: number;
      cases: number;
      projectRoot?: string;
      configPath?: string;
      startedAt?: string;
      maxConcurrentProjects?: number | null;
      maxConcurrentFiles?: number | null;
      configuredModels?: readonly {
        name: string;
        intents: readonly string[];
      }[];
      files?: readonly {
        documentId: string;
        projectName: string;
        sourcePath: string;
        cases: number;
      }[];
    }
  | {
      type: 'document-start';
      documentId: string;
      projectName: string;
      sourcePath: string;
      cases: number;
    }
  | {
      type: 'document-end';
      document: WorkflowDocumentRunResult;
      cases: readonly CaseRunOutcome[];
      durationMs: number;
    }
  | { type: 'step-start'; projectName: string; info: StepExecutionInfo }
  | {
      type: 'step-end';
      projectName: string;
      info: StepExecutionInfo;
      result?: StepRunResult;
    }
  | { type: 'case-attempt-end'; attempt: CaseRunResult; maxAttempts: number }
  | {
      type: 'case-progress';
      outcome: CaseRunOutcome;
      documentAttemptIndex: number;
    }
  | { type: 'case-end'; outcome: CaseRunOutcome; documentRetries?: number }
  | {
      type: 'document-retry';
      document: WorkflowDocumentRunResult;
      maxAttempts: number;
    };
