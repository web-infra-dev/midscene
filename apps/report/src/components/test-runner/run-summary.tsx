import {
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
  RightOutlined,
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
      <span>{label}</span>
      <strong>{value}</strong>
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
  const outcomeActionLabel =
    dump.summary.failed > 0
      ? `Review ${dump.summary.failed} failed ${
          dump.summary.failed === 1 ? 'case' : 'cases'
        }`
      : successfulWithRetries
        ? `Compare ${health.retryPassedCount} recovered ${
            health.retryPassedCount === 1 ? 'case' : 'cases'
          }`
        : 'Browse all cases';

  return (
    <section className="runner-overview-summary" aria-label="Run outcome">
      <div className="runner-overview-outcome">
        <div className="runner-overview-outcome-heading">
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
        <h1>
          <strong>
            {dump.summary.passed} / {totalCaseCount}
          </strong>
          <span>cases passed</span>
          <span
            className="runner-overview-pass-percentage"
            aria-label="Percentage of all cases passed"
          >
            {totalCaseCount
              ? formatPercent(dump.summary.passed / totalCaseCount)
              : '—'}
          </span>
        </h1>
        <div className="runner-overview-summary-footer">
          <div className="runner-secondary-metrics">
            <span>
              <strong>{dump.projects.length}</strong> projects
            </span>
            <span>
              <strong>{formatDuration(dump.metrics.modelTimeMs)}</strong> model
              time
            </span>
            <span>
              <strong>{dump.metrics.modelCallCount}</strong> model calls
            </span>
            <span>
              <strong>{dump.metrics.totalTokens.toLocaleString()}</strong>{' '}
              tokens
            </span>
          </div>
          <div className="runner-overview-outcome-footer">
            <div className="runner-overview-run-meta">
              <span>{formatTimestamp(dump.startedAt)}</span>
            </div>
            <button type="button" onClick={onReviewOutcome}>
              {outcomeActionLabel}
              <RightOutlined />
            </button>
          </div>
        </div>
      </div>
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
    </section>
  );
}
