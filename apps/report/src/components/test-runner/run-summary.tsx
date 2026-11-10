import type { TestRunReportDump } from '@midscene/core';
import type { PlaywrightTasks } from '../../types';
import type { RunnerHealthStats } from './model';
import { StatusBadge } from './status-badge';
import { TokenUsageTooltip } from './token-usage';
import { getRunTokenUsage } from './token-usage-model';
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
  reports,
}: {
  dump: TestRunReportDump;
  health: RunnerHealthStats;
  totalCaseCount: number;
  totalFileCount?: number;
  onReviewOutcome(): void;
  reports?: PlaywrightTasks[];
}): JSX.Element {
  const status = dump.status === 'failed' ? 'failed' : 'success';
  const healthLabel = status === 'failed' ? 'Run failed' : 'Run passed';
  const recoveredCount = Math.min(health.retryPassedCount, dump.summary.passed);
  const warning = recoveredCount
    ? `${recoveredCount} of ${dump.summary.passed} passed Cases had earlier failed attempts.`
    : undefined;
  const usage = getRunTokenUsage(dump.metrics);
  const tokenStatus = usage.status;
  const counts = [
    {
      label: 'Passed',
      value: dump.summary.passed,
      tone: 'success',
    },
    { label: 'Failed', value: dump.summary.failed, tone: 'danger' },
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
              aria-label={
                counts
                  .map(({ value, label }) => `${value} ${label}`)
                  .join(', ') + (warning ? `; ${warning}` : '')
              }
            >
              {counts.map(({ label, value, tone }) =>
                value > 0 ? (
                  <span
                    key={label}
                    className={`is-${tone}`}
                    style={{ flexGrow: value }}
                  >
                    {tone === 'success' && recoveredCount > 0 ? (
                      <span
                        className="runner-result-recovered"
                        style={{ width: `${(100 * recoveredCount) / value}%` }}
                        title={warning}
                      />
                    ) : null}
                  </span>
                ) : null,
              )}
            </div>
            <div className="runner-counts" aria-label="Run health metrics">
              {[
                counts[0],
                {
                  label: 'Passed after retry',
                  value: recoveredCount,
                  tone: 'recovered',
                },
                ...counts.slice(1),
              ].map(({ label, value, tone }) => (
                <div
                  key={label}
                  className={`is-${tone}`}
                  title={tone === 'recovered' ? warning : undefined}
                >
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
        <TokenUsageTooltip usage={usage} reports={reports} scope="run">
          tokens
          <strong>
            {tokenStatus === 'unknown'
              ? '—'
              : dump.metrics.totalTokens.toLocaleString()}
          </strong>
          {tokenStatus === 'partial' ? '(partial)' : null}
        </TokenUsageTooltip>
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
