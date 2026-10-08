import type { TestRunReportMetrics } from '@midscene/core';
import { Alert } from 'antd';

export function MetricsCollection({
  metrics,
}: { metrics: TestRunReportMetrics }): JSX.Element | null {
  const collection = metrics.collection;
  if (collection?.status === 'complete') return null;
  return (
    <Alert
      type="warning"
      showIcon
      message={
        collection?.status === 'partial'
          ? 'Partial model metrics'
          : 'Model metrics unknown'
      }
      description={
        <>
          <p>
            {collection?.status === 'partial'
              ? 'Values include only collected data and may undercount model calls, time and tokens.'
              : 'Model usage was not collected. These values are unknown.'}
          </p>
          {collection && collection.expectedExecutionCount > 0 ? (
            <p>
              Execution references collected:{' '}
              {collection.capturedExecutionCount} /{' '}
              {collection.expectedExecutionCount}.
            </p>
          ) : null}
          {collection?.reasons.length ? (
            <details>
              <summary>Collection details</summary>
              {collection.reasons.map((reason, index) => (
                <p key={`${index}-${reason}`}>{reason}</p>
              ))}
            </details>
          ) : null}
        </>
      }
    />
  );
}
