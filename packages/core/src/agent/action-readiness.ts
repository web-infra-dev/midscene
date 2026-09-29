import type {
  ActionReadyContext,
  ActionReadyPlan,
  ActionReadyWaiter,
  WaitForActionReadyOptions,
} from '@/types';
import { getErrorMessage } from '@midscene/shared/agent-tools/error-formatter';
import { getDebug } from '@midscene/shared/logger';

const warn = getDebug('agent:action-readiness', { console: true });
const errorCode = 'ACTION_READINESS_FAILED';

export class ActionReadinessError extends Error {
  readonly code = errorCode;

  constructor(phase: string, actionName: string, cause: unknown) {
    super(
      `waitForActionReady ${phase} failed for ${actionName}: ${getErrorMessage(cause)}`,
      { cause },
    );
    this.name = 'ActionReadinessError';
  }
}

/** Also recognizes the bounded cause retained by TaskExecutionError. */
export function isActionReadinessError(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    const value = error as { code?: unknown; cause?: unknown };
    if (value.code === errorCode) return true;
    error = value.cause;
  }
  return false;
}

function validatePlan(plan: ActionReadyPlan): void {
  if (plan === 'skip' || plan === 'default') return;
  if (
    !plan ||
    typeof plan !== 'object' ||
    typeof plan.wait !== 'function' ||
    (plan.dispose !== undefined && typeof plan.dispose !== 'function')
  ) {
    throw new Error(
      'createWaiter must return "skip", "default", or an object with wait() and optional dispose()',
    );
  }
}

/** One independent, cancellable observation for one actual action execution. */
export class ActionReadyScope {
  inCallback = false;
  private readonly controller = new AbortController();
  private plan: ActionReadyPlan = 'default';
  private disposed = false;
  private disposal?: Promise<void>;
  private readonly disposedWaiters = new Set<ActionReadyWaiter>();
  private removeAbortListener?: () => void;

  constructor(
    readonly action: ActionReadyContext['action'],
    private readonly options: WaitForActionReadyOptions,
    abortSignal?: AbortSignal,
  ) {
    if (abortSignal) {
      const onAbort = () => this.abort(abortSignal.reason);
      if (abortSignal.aborted) onAbort();
      else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
        this.removeAbortListener = () =>
          abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  get mode(): 'skip' | 'default' | 'custom' {
    return typeof this.plan === 'string' ? this.plan : 'custom';
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(reason: unknown): void {
    this.controller.abort(reason);
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new ActionReadinessError(
        'cancelled',
        this.action.name,
        this.signal.reason,
      );
    }
  }

  private async bounded<T>(
    phase: string,
    work: () => T | Promise<T>,
    observeAbort = true,
  ): Promise<T> {
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    this.inCallback = true;
    try {
      return await new Promise<T>((resolve, reject) => {
        if (observeAbort) {
          onAbort = () => reject(this.signal.reason);
          if (this.signal.aborted) {
            onAbort();
            return;
          }
          this.signal.addEventListener('abort', onAbort, { once: true });
        }
        timer = setTimeout(() => {
          const error = new Error(`Timed out after ${timeoutMs}ms`);
          this.abort(error);
          reject(error);
        }, timeoutMs);
        // Attach both handlers immediately, including when work outlives cancellation.
        Promise.resolve()
          .then(() => {
            if (observeAbort) this.throwIfAborted();
            return work();
          })
          .then(resolve, reject);
      });
    } catch (cause) {
      if (isActionReadinessError(cause)) throw cause;
      throw new ActionReadinessError(phase, this.action.name, cause);
    } finally {
      this.inCallback = false;
      clearTimeout(timer);
      if (onAbort) this.signal.removeEventListener('abort', onAbort);
    }
  }

  async create(): Promise<void> {
    this.plan = await this.bounded('createWaiter', async () => {
      const plan = await this.options.createWaiter({
        action: this.action,
        signal: this.signal,
      });
      // A factory may return after cancellation. Dispose its late resources too.
      if (this.disposed || this.signal.aborted) {
        if (
          plan &&
          typeof plan === 'object' &&
          typeof plan.dispose === 'function'
        ) {
          await this.disposeWaiter(plan);
        }
        this.throwIfAborted();
      }
      // Keep disposable resources even if the waiter fails validation.
      this.plan = plan;
      validatePlan(plan);
      return plan;
    });
  }

  async wait(): Promise<void> {
    this.throwIfAborted();
    if (typeof this.plan === 'object') {
      const waiter = this.plan;
      await this.bounded('wait', () => waiter.wait());
    }
  }

  private async disposeWaiter(waiter: ActionReadyWaiter): Promise<void> {
    if (this.disposedWaiters.has(waiter)) return;
    this.disposedWaiters.add(waiter);
    if (typeof waiter.dispose === 'function') {
      await this.bounded('dispose', () => waiter.dispose!(), false);
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.removeAbortListener?.();
    this.disposal =
      this.plan && typeof this.plan === 'object'
        ? this.disposeWaiter(this.plan)
        : Promise.resolve();
    return this.disposal;
  }
}

export class ActionReadiness {
  private readonly scopes = new Set<ActionReadyScope>();
  private destroyed = false;

  constructor(private readonly options: WaitForActionReadyOptions) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('waitForActionReady must be an object with createWaiter');
    }
    if (typeof options.createWaiter !== 'function') {
      throw new Error('waitForActionReady.createWaiter must be a function');
    }
    const { timeoutMs } = options;
    if (
      timeoutMs !== undefined &&
      (!Number.isInteger(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 2_147_483_647)
    ) {
      throw new Error(
        'waitForActionReady.timeoutMs must be a positive integer no greater than 2147483647',
      );
    }
  }

  assertCanUseAgent(): void {
    const callback = [...this.scopes].find((scope) => scope.inCallback);
    if (callback) {
      throw new ActionReadinessError(
        'reentry',
        callback.action.name,
        new Error(
          "Cannot use this Agent's UI APIs while a readiness callback is running. Use underlying page/device APIs instead.",
        ),
      );
    }
  }

  async run<T>(
    action: ActionReadyContext['action'],
    abortSignal: AbortSignal | undefined,
    execute: (scope: ActionReadyScope) => Promise<T>,
  ): Promise<T> {
    const scope = new ActionReadyScope(action, this.options, abortSignal);
    this.scopes.add(scope);
    if (this.destroyed) scope.abort(new Error('Agent destroyed'));
    let result!: T;
    let failure: { error: unknown } | undefined;
    try {
      await scope.create();
      result = await execute(scope);
    } catch (error) {
      failure = { error };
      scope.abort(error);
    }
    try {
      await scope.dispose();
    } catch (error) {
      if (failure) {
        warn(
          `Failed to dispose readiness for ${action.name}: ${getErrorMessage(error)}`,
        );
      } else {
        failure = { error };
      }
    } finally {
      this.scopes.delete(scope);
    }
    if (failure) throw failure.error;
    return result;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    const scopes = [...this.scopes];
    for (const scope of scopes) scope.abort(new Error('Agent destroyed'));
    const results = await Promise.allSettled(
      scopes.map((scope) => scope.dispose()),
    );
    for (const result of results) {
      if (result.status === 'rejected') warn(getErrorMessage(result.reason));
    }
  }
}
