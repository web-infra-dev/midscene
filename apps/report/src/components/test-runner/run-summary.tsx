import type { TestRunReportDump } from '@midscene/core';
import type { RunnerHealthStats } from './model';
import { StatusBadge } from './status-badge';
import { formatDuration, formatTimestamp } from './view-primitives';

export function RunSummary({
  dump,
  health,
  totalCaseCount,
  totalFileCount = dump.projects.reduce(
    (sum, project) => sum + project.documents.length,
    0,
  ),
  onReviewOutcome,
}: {
  dump: TestRunReportDump;
  health: RunnerHealthStats;
  totalCaseCount: number;
  totalFileCount?: number;
  onReviewOutcome(): void;
}): JSX.Element {
  const successfulWithRetries =
    dump.summary.failed === 0 &&
    dump.summary.notRun === 0 &&
    health.retryPassedCount > 0;
  const status =
    dump.status === 'failed'
      ? 'failed'
      : successfulWithRetries
        ? 'warning'
        : 'success';
  const healthLabel =
    status === 'failed'
      ? 'Run failed'
      : status === 'warning'
        ? 'Passed after retry'
        : 'Run passed';
  const tokenStatus =
    dump.metrics.collection?.fields?.totalTokens ??
    dump.metrics.collection?.status ??
    'unknown';
  const counts = [
    {
      label: 'Passed',
      value: Math.max(0, dump.summary.passed - health.retryPassedCount),
      description: 'Passed without retry',
      tone: 'success',
    },
    { label: 'Failed', value: dump.summary.failed, tone: 'danger' },
    {
      label: 'Retried',
      value: health.retryPassedCount,
      description: 'Passed after retry',
      tone: 'warning',
    },
    { label: 'Not run', value: dump.summary.notRun, tone: 'neutral' },
  ];
  return (
    <section className="runner-overview-summary" aria-label="Run outcome">
      <div className="runner-outcome">
        <div className="runner-overview-title-row">
          <span>Case passed</span>
          <StatusBadge label={healthLabel} tone={status} />
        </div>
        <div className="runner-result-row">
          <button
            type="button"
            className="runner-passed"
            onClick={onReviewOutcome}
            aria-label={`Review case results: ${dump.summary.passed} of ${totalCaseCount} passed`}
          >
            <strong>
              <b>{dump.summary.passed}</b>/{totalCaseCount}
            </strong>
          </button>
          <div className="runner-results">
            <div
              className="runner-result-bar"
              role="img"
              aria-label={counts
                .map(
                  ({ value, label, description }) =>
                    `${value} ${description ?? label}`,
                )
                .join(', ')}
            >
              {counts.map(({ label, value, tone }) =>
                value > 0 ? (
                  <span
                    key={label}
                    className={`is-${tone}`}
                    style={{ flexGrow: value }}
                  />
                ) : null,
              )}
            </div>
            <div className="runner-counts" aria-label="Run health metrics">
              {counts.map(({ label, value, tone, description }) => (
                <div key={label} className={`is-${tone}`} title={description}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="runner-run-meta">
        <span>
          Created at <strong>{formatTimestamp(dump.startedAt)}</strong>
        </span>
        <span>
          tokens
          <strong>
            {tokenStatus === 'unknown'
              ? '—'
              : dump.metrics.totalTokens.toLocaleString()}
          </strong>
          {tokenStatus === 'partial' ? '(partial)' : null}
        </span>
        <span>
          total time <strong>{formatDuration(dump.durationMs)}</strong>
        </span>
        <span className="runner-source-count">
          Projects <strong>{dump.projects.length}</strong>
        </span>
        <span className="runner-source-count">
          Files <strong>{totalFileCount}</strong>
        </span>
      </div>
    </section>
  );
}
