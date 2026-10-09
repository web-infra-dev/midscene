import type {
  TestRunReportAttempt,
  TestRunReportDocument,
  TestRunReportRetryDecision,
} from '@midscene/core';
import { ErrorDetails } from './error-details';

const retryReasons: Record<TestRunReportRetryDecision['reason'], string> = {
  passed: 'The attempt passed.',
  'attempt-failed': 'The attempt failed and retry budget remains.',
  'budget-exhausted': 'The retry budget is exhausted.',
  'cleanup-pending':
    'Cleanup is still pending; another attempt cannot safely start.',
  'cleanup-failed': 'Cleanup failed; retrying would replay completed actions.',
  'operation-pending':
    'An operation is still running; another attempt cannot safely start.',
  'fatal-error': 'A fatal device error stopped execution.',
  interrupted: 'Execution was interrupted.',
  bail: 'The configured stop policy ended execution.',
  'infrastructure-error':
    'An execution or publication error stopped execution.',
};

export function ScopeOutcome({
  value,
  label,
  navigableStepIds,
}: {
  value: Pick<
    TestRunReportAttempt | TestRunReportDocument,
    | 'executionStatus'
    | 'phases'
    | 'cleanup'
    | 'retryDecision'
    | 'pendingOperations'
  >;
  label: string;
  navigableStepIds?: ReadonlySet<string>;
}): JSX.Element | null {
  if (!value.phases && !value.cleanup && !value.retryDecision) return null;
  const cleanup = value.cleanup;
  const retry = value.retryDecision;
  return (
    <section aria-label={`${label} outcome`} className="runner-panel">
      <strong>{label}</strong>
      {value.executionStatus ? (
        <p>
          Authored execution: {value.executionStatus}. Overall status also
          includes cleanup and host failures.
        </p>
      ) : null}
      {value.phases ? (
        <ul>
          {Object.entries(value.phases).map(([phase, result]) =>
            result ? (
              <li key={phase}>
                {phase}: {result.status} ({result.executedStepCount}/
                {result.plannedStepCount} steps executed)
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {cleanup ? (
        <p>
          Resource cleanup:{' '}
          {cleanup.status === 'pending'
            ? 'waiting at snapshot'
            : cleanup.status}
          .
          {cleanup.status === 'pending'
            ? ' Final completion is recorded in the operation event log while the process remains alive; this snapshot does not update.'
            : ''}
          {cleanup.blockingOperations
            ?.filter(
              (operation) =>
                operation.stepId && navigableStepIds?.has(operation.stepId),
            )
            .map((operation) => (
              <a
                key={operation.operationId}
                href={`#runner-step=${encodeURIComponent(operation.stepId!)}`}
              >
                {' '}
                View blocking step
              </a>
            ))}
        </p>
      ) : null}
      {cleanup?.error ? (
        <details>
          <summary>Cleanup failure</summary>
          <ErrorDetails error={cleanup.error} />
        </details>
      ) : null}
      {value.pendingOperations?.length && cleanup?.status !== 'pending' ? (
        <p>
          Operations are still running at this snapshot. Final settlement is
          recorded separately.
        </p>
      ) : null}
      {retry ? (
        <p>
          {retry.scope === 'case' ? 'Case' : 'Document'} retry:{' '}
          {retry.decision === 'retry' ? 'another attempt scheduled' : 'stopped'}
          . {retryReasons[retry.reason]} Budget: {retry.retryCount} additional
          attempts; attempts completed: {retry.attemptIndex + 1}.
        </p>
      ) : null}
    </section>
  );
}
