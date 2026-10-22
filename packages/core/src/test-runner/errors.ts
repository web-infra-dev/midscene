import type { z } from 'zod/v4';
import { sanitizeReportError } from './reporting/sanitize';

const workflowErrorKey = Symbol.for('@midscene/core/workflow-error');

export interface WorkflowErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export class WorkflowError extends Error {
  readonly [workflowErrorKey] = true;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: WorkflowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? 'WORKFLOW_ERROR';
    this.details = options.details;
  }

  toJSON(): Record<string, unknown> {
    return { ...sanitizeReportError(this) };
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

  static fromZod(node: string, error: z.ZodError): NodeInputValidationError {
    const issues = error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    const firstIssue = issues[0];
    const path = firstIssue?.path || '<root>';
    const message = firstIssue?.message ?? 'invalid input';
    return new NodeInputValidationError(
      `Node "${node}" input validation failed at "${path}": ${message}`,
      { node, issues },
    );
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

  constructor(
    node: string,
    cause: unknown,
    /** Failed actions can still produce useful, JSON-compatible diagnostic data. */
    readonly output?: import('./node/types').NodeResult,
  ) {
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

export class WorkflowLifecycleError extends WorkflowError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'WORKFLOW_LIFECYCLE_ERROR', details });
  }
}

export class ProjectSetupError extends WorkflowError {
  constructor(cause: unknown, details: { projectName: string }) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Project "${details.projectName}" setup failed: ${causeMessage}`, {
      code: 'PROJECT_SETUP_ERROR',
      details,
      cause,
    });
  }
}

export class ProjectTeardownError extends WorkflowError {
  constructor(
    cause: unknown,
    details: { projectName: string; registrationIndex: number },
  ) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Project "${details.projectName}" teardown failed: ${causeMessage}`, {
      code: 'PROJECT_TEARDOWN_ERROR',
      details,
      cause,
    });
  }
}

export class NodeScopeTeardownError extends WorkflowError {
  constructor(
    cause: unknown,
    details: {
      scope: 'case' | 'document';
      scopeId: string;
      node: string;
      registrationIndex: number;
    },
  ) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(
      `${details.scope === 'case' ? 'Case attempt' : 'Workflow document'} node teardown failed for "${details.node}": ${causeMessage}`,
      { code: 'NODE_SCOPE_TEARDOWN_ERROR', details, cause },
    );
  }
}

export class FatalDeviceError extends WorkflowError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'FATAL_DEVICE_ERROR', cause });
  }
}

export const isFatalDeviceError = (error: unknown): boolean => {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length && seen.size < 50) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null || seen.has(current))
      continue;
    seen.add(current);
    if (
      current instanceof FatalDeviceError ||
      (current as { code?: unknown }).code === 'FATAL_DEVICE_ERROR'
    )
      return true;
    if (
      current instanceof Error &&
      /device offline|device not found|(?:adb|bdc|device) connection (?:was )?closed/i.test(
        current.message,
      )
    )
      return true;
    const nested = current as { cause?: unknown; errors?: unknown };
    if (nested.cause !== undefined) pending.push(nested.cause);
    if (Array.isArray(nested.errors))
      pending.push(...nested.errors.slice(0, 50));
  }
  return false;
};

export class CaseExecutionError extends WorkflowError {
  readonly result: import('./engine/types').CaseRunResult;

  constructor(result: import('./engine/types').CaseRunResult) {
    super(`Case "${result.name}" failed.`, {
      code: 'CASE_EXECUTION_FAILED',
      details: { caseId: result.caseId, runId: result.runId },
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

export function normalizeNodeExecutionError(
  error: unknown,
  node: string,
): WorkflowError {
  return isWorkflowError(error) ? error : new NodeExecutionError(node, error);
}

/** CJS and ESM integrations share error identity without wrapping it twice. */
export function isWorkflowError(error: unknown): error is WorkflowError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as WorkflowError)[workflowErrorKey] === true
  );
}

/** A cancelled operation exhausted its recovery budget within its owning scope. */
export const isResourceRecoveryError = (error: unknown): boolean =>
  isWorkflowError(error) && error.code === 'RESOURCE_RECOVERY_TIMEOUT';
