import { CopyOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useState } from 'react';
import { ErrorDetails } from './error-details';
import { getIssuePresentation } from './issue-presentation';
import { type ReportIssue, sortIssues } from './issues';
import { ReportValue } from './view-primitives';

function ErrorCard({
  issue,
  navigableStepIds,
  showDetails = false,
  currentStepId,
}: {
  issue: ReportIssue;
  navigableStepIds?: ReadonlySet<string>;
  showDetails?: boolean;
  currentStepId?: string;
}): JSX.Element {
  const { title, message, reasons } = getIssuePresentation(issue);
  const [copyState, setCopyState] = useState('Copy issue details');
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(JSON.stringify(issue, null, 2));
      setCopyState('Copied issue details');
    } catch {
      setCopyState('Copy issue details failed');
    }
  };
  return (
    <article
      className={`runner-error-card is-${issue.severity}`}
      data-issue-code={issue.code}
    >
      <ExclamationCircleFilled className="runner-error-icon" />
      <div className="runner-error-content">
        <strong>{title}</strong>
        {issue.label ? (
          <span className="runner-error-label">{issue.label}</span>
        ) : null}
        {message ? <p>{message}</p> : null}
        {reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        {showDetails && issue.error ? (
          <ErrorDetails
            error={issue.error}
            hideMessage
            summaryMessage={issue.message}
          />
        ) : null}
        {showDetails &&
        issue.context &&
        !['PARTIAL_MODEL_METRICS', 'MODEL_METRICS_UNKNOWN'].includes(
          issue.code,
        ) ? (
          <ReportValue value={{ value: issue.context }} />
        ) : null}
        {[...new Set(issue.relatedStepIds)]
          .filter((id) => id !== currentStepId && navigableStepIds?.has(id))
          .map((id) => (
            <a key={id} href={`#runner-step=${encodeURIComponent(id)}`}>
              View blocking step
            </a>
          ))}
      </div>
      <button
        type="button"
        title={copyState}
        aria-label={copyState}
        onClick={copy}
      >
        <CopyOutlined />
      </button>
    </article>
  );
}

export function ErrorCards({
  issues,
  label,
  navigableStepIds,
  showDetails,
  currentStepId,
}: {
  issues: readonly ReportIssue[];
  label: string;
  navigableStepIds?: ReadonlySet<string>;
  showDetails?: boolean;
  currentStepId?: string;
}): JSX.Element | null {
  const [first, ...rest] = sortIssues(issues).filter(
    (issue) => issue.severity !== 'info',
  );
  if (!first) return null;
  return (
    <section className="runner-error-cards" aria-label={label}>
      <ErrorCard
        key={first.id}
        issue={first}
        navigableStepIds={navigableStepIds}
        showDetails={showDetails}
        currentStepId={currentStepId}
      />
      {rest.length ? (
        <details className="runner-error-more">
          <summary>
            Show {rest.length} more {rest.length === 1 ? 'issue' : 'issues'}
          </summary>
          {rest.map((issue) => (
            <ErrorCard
              key={issue.id}
              issue={issue}
              navigableStepIds={navigableStepIds}
              showDetails={showDetails}
              currentStepId={currentStepId}
            />
          ))}
        </details>
      ) : null}
    </section>
  );
}
