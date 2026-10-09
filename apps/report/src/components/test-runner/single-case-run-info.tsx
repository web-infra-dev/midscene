import type { TestRunReportDump } from '@midscene/core';
import { Alert } from 'antd';
import { MetricsCollection } from './metrics-collection';
import { OperationLogs } from './operation-logs';
import { RunDiagnostics } from './run-diagnostics';
import { getRunDiagnostics } from './run-diagnostics-model';
import { TestPlan } from './test-plan';
import { formatDuration, formatTimestamp } from './view-primitives';

export function SingleCaseRunInfo({
  dump,
}: { dump: TestRunReportDump }): JSX.Element {
  const { summary } = getRunDiagnostics(dump);
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
          description={
            summary ||
            'The run did not complete successfully. Check the execution steps and run diagnostics.'
          }
        />
      )}
      <RunDiagnostics dump={dump} />
      <TestPlan dump={dump} />
    </section>
  );
}
