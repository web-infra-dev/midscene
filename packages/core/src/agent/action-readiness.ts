import type { ActionReadyContext, WaitForActionReady } from '@/types';
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

/** Await application readiness after a successful action; slow waits only warn. */
export class ActionReadiness {
  constructor(private readonly callback: WaitForActionReady) {
    if (typeof callback !== 'function') {
      throw new Error('waitForActionReady must be a function');
    }
  }

  async wait(action: ActionReadyContext['action']): Promise<void> {
    const timer = setTimeout(() => {
      warn(
        `waitForActionReady for ${action.name} (${action.id}) is still pending after 5000ms; continuing to wait.`,
      );
    }, 5000);
    try {
      await this.callback({ action });
    } catch (cause) {
      throw new ActionReadinessError('wait', action.name, cause);
    } finally {
      clearTimeout(timer);
    }
  }
}
