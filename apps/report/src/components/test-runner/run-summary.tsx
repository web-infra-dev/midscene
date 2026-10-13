import type { TestRunReportDump } from '@midscene/core';
import type { RunnerHealthStats } from './model';
import { StatusBadge } from './status-badge';
import { formatDuration, formatTimestamp } from './view-primitives';

export function RunSummary({
  dump,
  health,
  totalCaseCount,
  onReviewOutcome,
}: {
  dump: TestRunReportDump;
  health: RunnerHealthStats;
  totalCaseCount: number;
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
    { label: 'Projects', value: dump.projects.length },
    { label: 'Cases', value: totalCaseCount },
    { label: 'Passed', value: dump.summary.passed, tone: 'success' },
    { label: 'Failed', value: dump.summary.failed, tone: 'danger' },
    { label: 'Passed after retry', value: health.retryPassedCount },
    { label: 'Not run', value: dump.summary.notRun },
  ];
  return (
    <section className="runner-overview-summary" aria-label="Run outcome">
      <div className="runner-overview-outcome">
        <div className="runner-overview-title-row">
          <button
            type="button"
            className="runner-overview-passed"
            onClick={onReviewOutcome}
            aria-label={`Review case results: ${dump.summary.passed} of ${totalCaseCount} passed`}
          >
            <strong>
              <b>{dump.summary.passed}</b> / {totalCaseCount}
            </strong>
            <span>Case passed</span>
          </button>
          <StatusBadge label={healthLabel} tone={status} />
        </div>
        <div className="runner-overview-run-meta">
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
        </div>
      </div>
      <div className="runner-overview-counts" aria-label="Run health metrics">
        {counts.map(({ label, value, tone }) => (
          <div key={label} className={tone ? `is-${tone}` : undefined}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
