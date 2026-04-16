import type { IModelConfig } from '@midscene/shared/env';

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
 * timeout entirely; only a caller-provided `abortSignal` will cancel the
 * request in that case.
 */
export const DEFAULT_AI_CALL_TIMEOUT_MS = 180_000;

/** Identifying code set on the AbortError raised by our hard timeout. */
export const AI_CALL_HARD_TIMEOUT_CODE = 'AI_CALL_HARD_TIMEOUT';

/**
 * Resolve the hard request timeout for an AI call.
 * Returns `null` when the user explicitly opted out (`timeout === 0`).
 */
export function resolveEffectiveTimeoutMs(
  modelConfig: Pick<IModelConfig, 'timeout'>,
): number | null {
  const { timeout } = modelConfig;
  if (typeof timeout !== 'number') return DEFAULT_AI_CALL_TIMEOUT_MS;
  if (timeout <= 0) return null;
  return timeout;
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
      const err = new Error(
        `AI call hard timeout after ${timeoutMs}ms (full request time exceeded)`,
      ) as Error & { code?: string };
      err.code = AI_CALL_HARD_TIMEOUT_CODE;
      controller.abort(err);
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
