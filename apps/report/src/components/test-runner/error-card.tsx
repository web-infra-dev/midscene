import { CopyOutlined } from '@ant-design/icons';
import { Drawer } from 'antd';
import { useRef, useState } from 'react';
import { ErrorDetails, hasErrorDetails } from './error-details';
import { getIssuePresentation } from './issue-presentation';
import { type ReportIssue, sortIssues, splitIssue } from './issues';
import { ReportValue } from './view-primitives';

function ErrorCard({
  issue,
  navigableStepIds,
  currentStepId,
  onNavigate,
}: {
  issue: ReportIssue;
  navigableStepIds?: ReadonlySet<string>;
  currentStepId?: string;
  onNavigate?(): void;
}): JSX.Element {
  const { title, message, reasons } = getIssuePresentation(issue);
  const { reasons: _reasons, ...context } = issue.context ?? {};
  const hasContext = Object.keys(context).length > 0;
  const summary = `${issue.message}\n${message ?? ''}`;
  const hasDetails = Boolean(
    hasContext || (issue.error && hasErrorDetails(issue.error, summary)),
  );
  const links = [...new Set(issue.relatedStepIds)].filter(
    (id) => id !== currentStepId && navigableStepIds?.has(id),
  );
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
      <span className="runner-error-icon" aria-hidden="true" />
      <div className="runner-error-content">
        <strong>{title}</strong>
        {issue.label ? (
          <span className="runner-error-label">{issue.label}</span>
        ) : null}
      </div>
      <button
        type="button"
        title={copyState}
        aria-label={copyState}
        onClick={copy}
      >
        <CopyOutlined />
      </button>
      {message || reasons.length || hasDetails || links.length ? (
        <div className="runner-error-body">
          {message ? <p>{message}</p> : null}
          {reasons.length ? (
            <ul className="runner-error-reasons">
              {reasons.slice(0, 2).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {reasons.length > 2 ? (
            <details className="runner-error-reasons-more">
              <summary>
                <span className="when-closed">
                  Show {reasons.length - 2} more reasons
                </span>
                <span className="when-open">Hide additional reasons</span>
              </summary>
              <ul className="runner-error-reasons">
                {reasons.slice(2).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {hasDetails ? (
            <details className="runner-error-details">
              <summary>details</summary>
              <div className="runner-error-details-body">
                {issue.error ? (
                  <ErrorDetails
                    error={issue.error}
                    hideMessage
                    summaryMessage={summary}
                  />
                ) : null}
                {hasContext ? <ReportValue value={{ value: context }} /> : null}
              </div>
            </details>
          ) : null}
          {links.map((id) => (
            <a
              key={id}
              href={`#runner-step=${encodeURIComponent(id)}`}
              onClick={onNavigate}
            >
              View blocking step
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ErrorCards({
  issues,
  label,
  navigableStepIds,
  currentStepId,
}: {
  issues: readonly ReportIssue[];
  label: string;
  navigableStepIds?: ReadonlySet<string>;
  currentStepId?: string;
}): JSX.Element | null {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const visibleIssues = sortIssues(issues.flatMap(splitIssue)).filter(
    (issue) => issue.severity !== 'info',
  );
  const [first] = visibleIssues;
  if (!first) return null;
  const renderCard = (issue: ReportIssue, onNavigate?: () => void) => (
    <ErrorCard
      key={issue.id}
      issue={issue}
      navigableStepIds={navigableStepIds}
      currentStepId={currentStepId}
      onNavigate={onNavigate}
    />
  );
  return (
    <section
      ref={containerRef}
      className="runner-error-cards"
      aria-label={label}
    >
      {renderCard(first)}
      {visibleIssues.length > 1 ? (
        <>
          <button
            type="button"
            className="runner-error-more"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            View all {visibleIssues.length} issues
          </button>
          <Drawer
            title={`${label} (${visibleIssues.length})`}
            aria-label={`${label} (${visibleIssues.length})`}
            placement="right"
            width={800}
            rootClassName="runner-issue-drawer"
            rootStyle={{ position: 'fixed' }}
            getContainer={() =>
              containerRef.current?.closest<HTMLElement>(
                '.test-runner-report',
              ) ?? document.body
            }
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            closeIcon={
              <span className="runner-issue-drawer-close" aria-hidden="true" />
            }
          >
            <div className="runner-issue-drawer-list">
              {visibleIssues.map((issue) =>
                renderCard(issue, () => setDrawerOpen(false)),
              )}
            </div>
          </Drawer>
        </>
      ) : null}
    </section>
  );
}
