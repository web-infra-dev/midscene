export interface WorkflowErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export class WorkflowError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: WorkflowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? 'WORKFLOW_ERROR';
    this.details = options.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export class WorkflowParseError extends WorkflowError {
  constructor(message: string, details?: unknown, cause?: unknown) {
    super(message, { code: 'WORKFLOW_PARSE_ERROR', details, cause });
  }
}

export class NodeDefinitionError extends WorkflowError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'NODE_DEFINITION_ERROR', details });
  }
}

export class DuplicateNodeError extends WorkflowError {
  readonly node: string;

  constructor(node: string) {
    super(`Node "${node}" is already registered.`, {
      code: 'DUPLICATE_NODE',
      details: { node },
    });
    this.node = node;
  }
}

export class NodeNotFoundError extends WorkflowError {
  readonly node: string;

  constructor(node: string) {
    super(`Node "${node}" is not registered.`, {
      code: 'NODE_NOT_FOUND',
      details: { node },
    });
    this.node = node;
  }
}

export class NodeInputValidationError extends WorkflowError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'NODE_INPUT_VALIDATION_ERROR', details });
  }
}

export class StepTimeoutError extends WorkflowError {
  readonly timeoutMs: number;
  readonly node?: string;

  constructor(timeoutMs: number, node?: string) {
    super(
      node
        ? `Node "${node}" timed out after ${timeoutMs}ms.`
        : `Step timed out after ${timeoutMs}ms.`,
      {
        code: 'STEP_TIMEOUT',
        details: { timeoutMs, ...(node === undefined ? {} : { node }) },
      },
    );
    this.timeoutMs = timeoutMs;
    this.node = node;
  }
}

export class NodeExecutionError extends WorkflowError {
  readonly node: string;

  constructor(node: string, cause: unknown) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Node "${node}" failed: ${causeMessage}`, {
      code: 'NODE_EXECUTION_ERROR',
      details: { node },
      cause,
    });
    this.node = node;
  }
}

export class WorkflowDocumentSetupError extends WorkflowError {
  constructor(
    cause: unknown,
    details: { documentId: string; documentRunId: string },
  ) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Workflow document setup failed: ${causeMessage}`, {
      code: 'WORKFLOW_DOCUMENT_SETUP_ERROR',
      details,
      cause,
    });
  }
}

export class WorkflowDocumentTeardownError extends WorkflowError {
  constructor(
    cause: unknown,
    details: {
      documentId: string;
      documentRunId: string;
      registrationIndex: number;
    },
  ) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Workflow document teardown failed: ${causeMessage}`, {
      code: 'WORKFLOW_DOCUMENT_TEARDOWN_ERROR',
      details,
      cause,
    });
  }
}

export class WorkflowLifecycleError extends WorkflowError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'WORKFLOW_LIFECYCLE_ERROR', details });
  }
}

export class WorkflowExecutionError extends WorkflowError {
  readonly result: import('./engine/types').WorkflowRunResult;

  constructor(result: import('./engine/types').WorkflowRunResult) {
    super(`Workflow "${result.name}" failed.`, {
      code: 'WORKFLOW_EXECUTION_FAILED',
      details: { testId: result.testId, runId: result.runId },
    });
    this.result = result;
  }
}

export class WorkflowDocumentExecutionError extends WorkflowError {
  readonly result: import('./engine/types').WorkflowDocumentRunResult;

  constructor(result: import('./engine/types').WorkflowDocumentRunResult) {
    super(`Workflow document "${result.sourcePath}" failed.`, {
      code: 'WORKFLOW_DOCUMENT_EXECUTION_FAILED',
      details: {
        documentId: result.documentId,
        documentRunId: result.documentRunId,
      },
    });
    this.result = result;
  }
}

export function normalizeWorkflowError(
  error: unknown,
  node: string,
): WorkflowError {
  return error instanceof WorkflowError
    ? error
    : new NodeExecutionError(node, error);
}
