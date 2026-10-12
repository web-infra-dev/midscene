import type { ReportIssue } from './issues';

/** Errors have details in their cards; unexecuted steps keep their explanation here. */
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
      {issues
        .filter((issue) => issue.code === 'NOT_RUN')
        .map((issue) => {
          const links = [...new Set(issue.relatedStepIds)].filter(
            (id) => id !== currentStepId && navigableStepIds?.has(id),
          );
          return (
            <section
              key={issue.id}
              className="runner-issue-information"
              data-issue-code={issue.code}
            >
              <h4>Not run</h4>
              <div className="runner-information-body">
                <p>
                  {links.length
                    ? 'Blocked by a preceding step.'
                    : issue.message}
                </p>
                {links.map((id) => (
                  <a key={id} href={`#runner-step=${encodeURIComponent(id)}`}>
                    View blocking step
                  </a>
                ))}
              </div>
            </section>
          );
        })}
    </>
  );
}
