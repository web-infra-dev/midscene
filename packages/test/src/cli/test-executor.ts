import type {
  Awaitable,
  CaseRunOutcome,
  ProjectRuntimeResult,
  WorkflowDocumentRunResult,
} from '../engine/types';

export interface TestCaseTask {
  readonly taskId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly documentId: string;
  readonly sourcePath: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly caseIndex: number;
  readonly tags: readonly string[];
  readonly resources: readonly string[];
  readonly retry: number;
}

export interface TestCaseTaskRunResult {
  readonly case: CaseRunOutcome & { readonly documentId: string };
  readonly document?: WorkflowDocumentRunResult;
  readonly lifecycle?: ProjectRuntimeResult;
  readonly artifacts?: readonly TestCaseArtifact[];
  readonly metadata?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

export interface TestCaseArtifact {
  readonly name: string;
  /** Local path or URL made available by the Executor. */
  readonly uri: string;
  readonly mediaType?: string;
}

export interface TestExecutorContext {
  readonly signal: AbortSignal;
  readonly runLocal: () => Promise<TestCaseTaskRunResult>;
  readonly onProgress: (message: string) => void;
}

export type TestExecutorFailureKind =
  | 'provision'
  | 'transport'
  | 'cleanup'
  | 'report'
  | 'unknown';

export class TestExecutorError extends Error {
  readonly kind: TestExecutorFailureKind;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      kind?: TestExecutorFailureKind;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'TestExecutorError';
    this.kind = options.kind ?? 'unknown';
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Runs one isolated Midscene case. Implementations may execute locally or
 * delegate to another process, container, device farm, or remote service.
 */
export interface TestExecutor {
  readonly name: string;
  readonly execute: (
    task: TestCaseTask,
    context: TestExecutorContext,
  ) => Awaitable<TestCaseTaskRunResult>;
}

export const defineTestExecutor = <TExecutor extends TestExecutor>(
  executor: TExecutor,
): TExecutor => executor;

export const localTestExecutor: TestExecutor = Object.freeze({
  name: 'local',
  execute: (_task: TestCaseTask, context: TestExecutorContext) =>
    context.runLocal(),
});
