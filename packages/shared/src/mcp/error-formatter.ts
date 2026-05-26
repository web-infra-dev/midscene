/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Many SDK/transport layers reject with structured objects (e.g.
 * `{ code, message }`, `{ error: { message } }`, `{ cause: { message } }`)
 * rather than `Error` instances. `String(obj)` collapses those to
 * `"[object Object]"`, which is useless for diagnostics. This helper walks
 * the common shapes, falls back to `JSON.stringify`, and finally to
 * `Object.prototype.toString.call` so that callers always get something
 * actionable in logs and surfaced tool results.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === null || error === undefined) return String(error);
  if (typeof error !== 'object') return String(error);

  const candidate = extractStringMessage(error);
  if (candidate) return candidate;

  try {
    return JSON.stringify(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

function extractStringMessage(error: object): string | undefined {
  const anyError = error as {
    message?: unknown;
    error?: { message?: unknown };
    cause?: { message?: unknown };
  };

  if (typeof anyError.message === 'string' && anyError.message) {
    return anyError.message;
  }
  if (
    anyError.error &&
    typeof anyError.error.message === 'string' &&
    anyError.error.message
  ) {
    return anyError.error.message;
  }
  if (
    anyError.cause &&
    typeof anyError.cause.message === 'string' &&
    anyError.cause.message
  ) {
    return anyError.cause.message;
  }
  return undefined;
}
