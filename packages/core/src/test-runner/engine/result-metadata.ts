import type {
  TestRunReportPhaseResult,
  TestRunReportRetryDecision,
} from '../../test-run-report';
import type { StepRunResult } from './types';

export function phaseResult(
  plannedStepCount: number,
  steps: readonly StepRunResult[],
): TestRunReportPhaseResult {
  const executedStepCount = steps.filter(
    (step) => step.status !== 'not-run',
  ).length;
  return {
    plannedStepCount,
    executedStepCount,
    status:
      plannedStepCount === 0
        ? 'not-required'
        : steps.some((step) => step.status === 'failed')
          ? 'failed'
          : executedStepCount < plannedStepCount
            ? 'not-run'
            : 'success',
  };
}

/** Facts at the retry boundary, separate from the eventual cleanup outcome. */
export function decideRetry(options: {
  scope: 'case' | 'document';
  retryCount: number;
  attemptIndex: number;
  status: 'success' | 'failed';
  cleanupPending?: boolean;
  cleanupFailed?: boolean;
  operationPending?: boolean;
  infrastructureError?: boolean;
  fatalError?: boolean;
  interrupted?: boolean;
  shouldStop?: boolean;
}): TestRunReportRetryDecision {
  const reason = options.infrastructureError
    ? 'infrastructure-error'
    : options.cleanupPending
      ? 'cleanup-pending'
      : options.cleanupFailed
        ? 'cleanup-failed'
        : options.operationPending
          ? 'operation-pending'
          : options.fatalError
            ? 'fatal-error'
            : options.interrupted
              ? 'interrupted'
              : options.shouldStop
                ? 'bail'
                : options.status === 'success'
                  ? 'passed'
                  : options.attemptIndex >= options.retryCount
                    ? 'budget-exhausted'
                    : 'attempt-failed';
  return {
    scope: options.scope,
    retryCount: options.retryCount,
    attemptIndex: options.attemptIndex,
    decision: reason === 'attempt-failed' ? 'retry' : 'stop',
    reason,
  };
}
