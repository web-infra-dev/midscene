import {
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import type { TestRunReportDump } from '@midscene/core';
import type { ReactNode } from 'react';
import type { RunnerHealthStats } from './model';
import { StatusBadge } from './status-badge';
import {
  formatDuration,
  formatPercent,
  formatTimestamp,
} from './view-primitives';

function RunMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'warning' | 'danger';
}): JSX.Element {
  return (
    <div className={`runner-metric-card${tone ? ` is-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

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
  return (
    <section className="runner-overview-summary" aria-label="Run outcome">
      <div className="runner-overview-outcome">
        <div className="runner-overview-title-row">
          <h1>Test Report</h1>
          <StatusBadge
            label={healthLabel}
            tone={status}
            icon={
              status === 'failed' ? (
                <CloseCircleFilled />
              ) : status === 'warning' ? (
                <ReloadOutlined />
              ) : (
                <CheckCircleFilled />
              )
            }
          />
        </div>
        <div className="runner-overview-run-meta">
          <span>Created at {formatTimestamp(dump.startedAt)}</span>
          <span>
            projects <strong>{dump.projects.length}</strong>
          </span>
          <span>
            Case <strong>{totalCaseCount}</strong>
          </span>
        </div>
      </div>
      <button
        type="button"
        className="runner-overview-passed"
        onClick={onReviewOutcome}
        aria-label="Review case results"
      >
        <strong>
          <b>{dump.summary.passed}</b>/{totalCaseCount}
        </strong>
        <span>Case passed</span>
      </button>
      <div
        className="runner-primary-metrics runner-overview-primary-metrics"
        aria-label="Run health metrics"
      >
        <RunMetric
          label="Final pass rate"
          value={formatPercent(health.finalPassRate)}
        />
        <RunMetric
          label="First-pass rate"
          value={formatPercent(health.firstPassRate)}
        />
        <RunMetric
          label="Failed"
          value={dump.summary.failed}
          tone={dump.summary.failed ? 'danger' : undefined}
        />
        <RunMetric
          label="Passed after retry"
          value={health.retryPassedCount}
          tone={health.retryPassedCount ? 'warning' : undefined}
        />
        <RunMetric
          label="Not run"
          value={dump.summary.notRun}
          tone={dump.summary.notRun ? 'warning' : undefined}
        />
        <RunMetric label="Run time" value={formatDuration(dump.durationMs)} />
      </div>
      <span
        className="runner-overview-pass-percentage"
        aria-label="Percentage of all cases passed"
      >
        {totalCaseCount
          ? formatPercent(dump.summary.passed / totalCaseCount)
          : '—'}
      </span>
    </section>
  );
}
