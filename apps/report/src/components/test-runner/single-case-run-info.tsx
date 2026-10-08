import type { TestRunReportDump } from '@midscene/core';
import { Alert } from 'antd';
import { LifecycleErrors, getProjectLifecycleIssues } from './lifecycle-errors';
import { MetricsCollection } from './metrics-collection';
import { OperationLogs } from './operation-logs';
import { TestPlan } from './test-plan';
import { formatDuration, formatTimestamp } from './view-primitives';

export function SingleCaseRunInfo({
  dump,
}: { dump: TestRunReportDump }): JSX.Element {
  const errors = dump.projects.flatMap((project) =>
    getProjectLifecycleIssues(project, false),
  );
  const diagnostics = dump.diagnostics ?? [];
  const issueCount = errors.length + diagnostics.length;
  const metricStatus = (
    field: 'modelCallCount' | 'modelTimeMs' | 'totalTokens',
  ) => {
    const collection = dump.metrics.collection;
    if (!collection || collection.status === 'unknown') return 'unknown';
    return collection.fields?.[field] ?? collection.status;
  };
  const partial = (field: 'modelCallCount' | 'modelTimeMs' | 'totalTokens') =>
    metricStatus(field) === 'partial' ? ' (partial)' : '';

  return (
    <section className="runner-single-run-info" aria-label="Run information">
      <div className="runner-single-run-metrics">
        <time dateTime={dump.startedAt}>{formatTimestamp(dump.startedAt)}</time>
        <span>
          <strong>{formatDuration(dump.durationMs)}</strong> run time
        </span>
        <span>
          <strong>
            {metricStatus('modelTimeMs') === 'unknown'
              ? '—'
              : formatDuration(dump.metrics.modelTimeMs)}
          </strong>{' '}
          model time{partial('modelTimeMs')}
        </span>
        <span>
          <strong>
            {metricStatus('modelCallCount') === 'unknown'
              ? '—'
              : dump.metrics.modelCallCount}
          </strong>{' '}
          model calls{partial('modelCallCount')}
        </span>
        <span>
          <strong>
            {metricStatus('totalTokens') === 'unknown'
              ? '—'
              : dump.metrics.totalTokens.toLocaleString()}
          </strong>{' '}
          tokens{partial('totalTokens')}
        </span>
      </div>
      <MetricsCollection metrics={dump.metrics} />
      <OperationLogs logs={dump.operationLogs} />
      {dump.status === 'failed' && (
        <Alert
          type="error"
          showIcon
          message="Run failed"
          description="The run did not complete successfully. Check the execution steps and run diagnostics."
        />
      )}
      {issueCount > 0 && (
        <details
          className="runner-single-run-diagnostics"
          open={dump.status === 'failed'}
        >
          <summary>Run diagnostics ({issueCount})</summary>
          <LifecycleErrors issues={errors} />
          {diagnostics.map((diagnostic, index) => (
            <Alert
              key={`${diagnostic.code}-${index}`}
              type={diagnostic.level === 'error' ? 'error' : 'warning'}
              showIcon
              message={diagnostic.message}
            />
          ))}
        </details>
      )}
      <TestPlan dump={dump} />
    </section>
  );
}
