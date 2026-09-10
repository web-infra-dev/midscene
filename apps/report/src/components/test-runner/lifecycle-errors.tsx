import { CloseCircleFilled, RightOutlined } from '@ant-design/icons';
import type { TestRunReportError, TestRunReportProject } from '@midscene/core';
import { ReportValue } from './view-primitives';

export interface LifecycleIssue {
  label: string;
  error: TestRunReportError;
}

/** Lifecycle failures are separate from ordinary Step errors in the dump. */
export function getProjectLifecycleIssues(
  project: TestRunReportProject,
  includeAttempts = true,
): LifecycleIssue[] {
  return [
    ...(project.lifecycle?.setupError
      ? [
          {
            label: `${project.name}: Project setup failed`,
            error: project.lifecycle.setupError,
          },
        ]
      : []),
    ...(project.lifecycle?.teardownErrors ?? []).map((error) => ({
      label: `${project.name}: Project teardown failed`,
      error,
    })),
    ...project.collectionErrors.map(({ sourcePath, error }) => ({
      label: `Could not collect ${sourcePath}`,
      error,
    })),
    ...project.documents.flatMap((document) => [
      ...[...document.beforeAll, ...document.afterAll].flatMap((step) =>
        step.error
          ? [
              {
                label: `${document.sourcePath}: ${step.phase} · ${step.node}`,
                error: step.error,
              },
            ]
          : [],
      ),
      ...(document.teardownErrors ?? []).map((error) => ({
        label: `Document teardown failed: ${document.sourcePath}`,
        error,
      })),
      ...(includeAttempts
        ? document.cases.flatMap((item) =>
            item.attempts.flatMap((attempt) =>
              (attempt.teardownErrors ?? []).map((error) => ({
                label: `${item.name} · Attempt ${attempt.attemptIndex + 1}: Case teardown failed`,
                error,
              })),
            ),
          )
        : []),
    ]),
  ];
}

export function LifecycleErrors({
  issues,
}: { issues: readonly LifecycleIssue[] }): JSX.Element | null {
  if (!issues.length) return null;
  return (
    <section className="runner-lifecycle-errors" aria-label="Lifecycle errors">
      {issues.map(({ label, error }, index) => (
        <details className="runner-lifecycle-issue" key={`${label}-${index}`}>
          <summary>
            <CloseCircleFilled className="runner-lifecycle-icon" aria-hidden />
            <span className="runner-lifecycle-summary">
              <span className="runner-lifecycle-label">{label}</span>
              <span className="runner-lifecycle-message">{error.message}</span>
            </span>
            <span className="runner-lifecycle-toggle">
              <RightOutlined aria-hidden />
            </span>
          </summary>
          <div className="runner-lifecycle-diagnostics">
            <dl>
              <div>
                <dt>Type</dt>
                <dd>{error.name}</dd>
              </div>
              {error.code ? (
                <div>
                  <dt>Code</dt>
                  <dd>{error.code}</dd>
                </div>
              ) : null}
            </dl>
            <p>{error.message}</p>
            {error.details ? <ReportValue value={error.details} /> : null}
          </div>
        </details>
      ))}
    </section>
  );
}
