import { ErrorDetails, hasErrorDetails } from './error-details';
import type { ReportIssue } from './issues';
import { ReportValue } from './view-primitives';

export const hasIssueInformation = (issue: ReportIssue) =>
  issue.severity === 'info'
    ? issue.code === 'NOT_RUN'
    : Boolean(
        issue.context ||
          (issue.error && hasErrorDetails(issue.error, issue.message)),
      );

/** Core error text lives in its card; supporting facts have one home here. */
export function IssueInformation({
  issues,
  navigableStepIds,
  currentStepId,
}: {
  issues: readonly ReportIssue[];
  navigableStepIds?: ReadonlySet<string>;
  currentStepId?: string;
}): JSX.Element {
  return (
    <>
      {issues.filter(hasIssueInformation).map((issue) => {
        const links = [
          ...new Set(issue.code === 'NOT_RUN' ? issue.relatedStepIds : []),
        ].filter((id) => id !== currentStepId && navigableStepIds?.has(id));
        const blocked = issue.code === 'NOT_RUN' && links.length > 0;
        return (
          <section
            key={issue.id}
            className="runner-issue-information"
            data-issue-code={issue.code}
          >
            <h4>
              {issue.code === 'NOT_RUN'
                ? 'Not run'
                : issue.severity === 'error'
                  ? 'Error details'
                  : 'Warning details'}
            </h4>
            <div className="runner-information-body">
              {issue.code === 'NOT_RUN' ? (
                <p>
                  {blocked ? 'Blocked by a preceding step.' : issue.message}
                </p>
              ) : null}
              {links.map((id) => (
                <a key={id} href={`#runner-step=${encodeURIComponent(id)}`}>
                  View blocking step
                </a>
              ))}
              {issue.error ? (
                <ErrorDetails
                  error={issue.error}
                  hideMessage
                  summaryMessage={issue.message}
                />
              ) : null}
              {issue.context ? (
                <ReportValue value={{ value: issue.context }} />
              ) : null}
            </div>
          </section>
        );
      })}
    </>
  );
}
