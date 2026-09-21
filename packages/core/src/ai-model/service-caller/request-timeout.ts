/**
 * Default hard timeout (ms) applied to every AI HTTP call.
 *
 * We need an end-to-end timeout for the whole request lifecycle, not just the
 * time until response headers arrive. Some providers can return headers
 * quickly and then stall while the body is still being read.
 *
 * Override per intent via `MIDSCENE_MODEL_TIMEOUT`,
 * `MIDSCENE_INSIGHT_MODEL_TIMEOUT`, or `MIDSCENE_PLANNING_MODEL_TIMEOUT`.
 * Set the env var (or `modelConfig.timeout`) to `0` to disable the hard
 * timeout. SDK and network timeouts still apply, and a caller-provided
 * `abortSignal` can still cancel the request. Each retry gets a fresh timeout;
 * retry waiting is not included in that timeout.
 */
export const DEFAULT_AI_CALL_TIMEOUT_MS = 180_000;

/** Identifying code for Midscene single-request timeouts. */
export const AI_CALL_HARD_TIMEOUT_CODE = 'AI_CALL_HARD_TIMEOUT';

export class AIRequestTimeoutError extends Error {
  readonly code = AI_CALL_HARD_TIMEOUT_CODE;

  constructor(readonly timeoutMs: number) {
    super(
      `AI call hard timeout after ${timeoutMs}ms (full request time exceeded)`,
    );
    this.name = 'AIRequestTimeoutError';
  }
}

/**
 * Resolve the hard request timeout for an AI call.
 * Returns `null` when the user explicitly opted out (`timeout === 0`).
 */
export function resolveEffectiveTimeoutMs(timeout?: number): number | null {
  if (timeout === undefined) {
    return DEFAULT_AI_CALL_TIMEOUT_MS;
  }
  return timeout === 0 ? null : timeout;
}

/**
 * True if the error was raised by our hard-timeout AbortSignal (vs any other
 * abort/network/HTTP error). Used to drive observability without having to
 * string-match the message.
 */
export function isHardTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === AI_CALL_HARD_TIMEOUT_CODE) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === 'object' &&
    (cause as { code?: unknown }).code === AI_CALL_HARD_TIMEOUT_CODE
  ) {
    return true;
  }
  return false;
}

// Wires a hard timeout into the abort signal passed to fetch so the request
// is actually cancelled even if the provider/client timeout only covers part
// of the request. Honours any abortSignal supplied by the caller. Passing
// `null` for `timeoutMs` disables the hard timeout and only forwards the user
// signal.
export function buildRequestAbortSignal(
  timeoutMs: number | null,
  userSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  if (userSignal?.aborted) {
    controller.abort(userSignal.reason);
    return { signal: controller.signal, cleanup: () => {} };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== null) {
    timer = setTimeout(() => {
      controller.abort(new AIRequestTimeoutError(timeoutMs));
    }, timeoutMs);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
  }

  const onUserAbort = userSignal
    ? () => controller.abort(userSignal.reason)
    : undefined;
  if (userSignal && onUserAbort) {
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      if (userSignal && onUserAbort) {
        userSignal.removeEventListener('abort', onUserAbort);
      }
    },
  };
}

/** Stops awaiting promptly while still forwarding cancellation to the actual request. */
export async function runWithAbortSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation(), aborted]);
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

/** Both completion paths remove the listener and cancel the unused timer. */
export function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
