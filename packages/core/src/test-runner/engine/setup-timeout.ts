import { WorkflowError } from '../errors';
import { trackResourceOperation } from './resource-operations';

/** Keep tracking a timed-out acquisition until it actually settles. */
export async function runSetupWithTimeout<T>(
  setup: () => Promise<T>,
  signal: AbortSignal,
  abort: (reason: unknown) => void,
  timeoutMs?: number,
): Promise<T> {
  if (timeoutMs === undefined) return setup();
  signal.throwIfAborted();
  const operation = Promise.resolve().then(setup);
  trackResourceOperation({}, operation, signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new WorkflowError(
        `Environment setup timed out after ${timeoutMs}ms.`,
        {
          code: 'SETUP_TIMEOUT',
          details: { timeoutMs },
        },
      );
      abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, stopped]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
