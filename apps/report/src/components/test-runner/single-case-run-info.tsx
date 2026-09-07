import type { TestRunReportDump } from '@midscene/core';
import { Alert } from 'antd';
import { formatDuration, formatTimestamp } from './view-primitives';

export function SingleCaseRunInfo({
  dump,
}: { dump: TestRunReportDump }): JSX.Element {
  const errors = dump.projects.flatMap((project) => [
    ...(project.lifecycle?.setupError
      ? [{ label: 'Project setup failed', error: project.lifecycle.setupError }]
      : []),
    ...(project.lifecycle?.teardownErrors ?? []).map((error) => ({
      label: 'Project teardown failed',
      error,
    })),
    ...project.collectionErrors.map(({ sourcePath, error }) => ({
      label: `Could not collect ${sourcePath}`,
      error,
    })),
    ...project.documents.flatMap((document) =>
      (document.teardownErrors ?? []).map((error) => ({
        label: `Document teardown failed: ${document.sourcePath}`,
        error,
      })),
    ),
  ]);
  const diagnostics = dump.diagnostics ?? [];
  const issueCount = errors.length + diagnostics.length;

  return (
    <section className="runner-single-run-info" aria-label="Run information">
      <div className="runner-single-run-metrics">
        <time dateTime={dump.startedAt}>{formatTimestamp(dump.startedAt)}</time>
        <span>
          <strong>{formatDuration(dump.durationMs)}</strong> run time
        </span>
        <span>
          <strong>{formatDuration(dump.metrics.modelTimeMs)}</strong> model time
        </span>
        <span>
          <strong>{dump.metrics.modelCallCount}</strong> model calls
        </span>
        <span>
          <strong>{dump.metrics.totalTokens.toLocaleString()}</strong> tokens
        </span>
      </div>
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
          {errors.map(({ label, error }, index) => (
            <Alert
              key={`${label}-${index}`}
              type="error"
              showIcon
              message={label}
              description={error.message}
            />
          ))}
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
    </section>
  );
}
