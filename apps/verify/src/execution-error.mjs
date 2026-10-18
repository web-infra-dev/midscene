// Midscene wraps provider errors through TaskExecutionError and aiAssert. Keep
// infrastructure failures separate without copying provider bodies or secrets.
export function executionErrorCode(error) {
  const visited = new Set();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    const message = String(current.message ?? '');
    if (
      /failed to call AI model service|AI model request failed/i.test(message)
    ) {
      return 'MODEL_SERVICE_ERROR';
    }
    if (message === 'PAGE_UNAVAILABLE') return 'ENVIRONMENT_ERROR';
    current = current.cause;
  }
  return 'STEP_EXECUTION_FAILED';
}
