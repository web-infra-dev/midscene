import { WorkflowError } from '../errors';

const errorMessage = (error: unknown): string =>
  error &&
  typeof error === 'object' &&
  'message' in error &&
  typeof error.message === 'string'
    ? error.message
    : String(error);

/** An infrastructure failure still carries all execution facts collected so far. */
export class WorkflowExecutionFailure<T> extends WorkflowError {
  constructor(
    readonly result: T,
    readonly errors: readonly unknown[],
  ) {
    super(errors.map(errorMessage).join('; '), {
      code: 'WORKFLOW_EXECUTION_FAILURE',
      cause: errors[0],
    });
  }
}

/** Publication is an infrastructure failure, not a failed test action. */
export class WorkflowPublicationError extends WorkflowError {
  constructor(
    operation: 'write-result' | 'write-report' | 'preserve-report',
    path: string,
    cause: unknown,
  ) {
    super(
      `Failed to ${operation} at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        code: 'WORKFLOW_PUBLICATION_FAILED',
        details: { operation, path },
        cause,
      },
    );
  }
}

export const asExecutionError = (error: unknown): WorkflowError =>
  error instanceof WorkflowError
    ? error
    : new WorkflowError(errorMessage(error), {
        code: 'WORKFLOW_EXECUTION_FAILURE',
        cause: error,
      });
