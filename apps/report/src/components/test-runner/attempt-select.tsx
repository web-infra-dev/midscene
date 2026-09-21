import type { TestRunReportAttempt } from '@midscene/core';
import type { RunnerCaseView } from './model';
import { Select } from './select';
import { StatusBadge } from './status-badge';
import { formatDuration } from './view-primitives';

function AttemptStatusBadge({
  status,
  label = status === 'success' ? 'passed' : 'failed',
  className,
}: {
  status: TestRunReportAttempt['status'];
  label?: string;
  className?: string;
}): JSX.Element {
  return (
    <StatusBadge
      label={label}
      tone={status === 'success' ? 'success' : 'failed'}
      quiet
      className={className}
    />
  );
}

function AttemptOptionLabel({
  title,
  status,
}: {
  title: string;
  status: TestRunReportAttempt['status'];
}): JSX.Element {
  return (
    <span className="runner-attempt-option">
      <span>{title}</span>
      <AttemptStatusBadge
        className="runner-attempt-option-status"
        status={status}
      />
    </span>
  );
}

export function AttemptSelect({
  item,
  selectedAttempt,
  selectedDocumentAttemptIndex,
  onSelectAttempt,
  onSelectDocumentAttempt,
}: {
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  selectedDocumentAttemptIndex?: number;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
  onSelectDocumentAttempt?(attemptIndex: number): void;
}): JSX.Element {
  const selectedDocumentAttempt = item.document.attempts?.find(
    (attempt) => attempt.attemptIndex === selectedDocumentAttemptIndex,
  );
  const attemptStatus =
    selectedDocumentAttempt?.status ?? selectedAttempt?.status;
  const attemptDuration =
    selectedDocumentAttempt?.durationMs ?? selectedAttempt?.durationMs ?? 0;

  if (item.document.attempts) {
    return (
      <div className="runner-attempt-select-shell">
        {attemptStatus ? <AttemptStatusBadge status={attemptStatus} /> : null}
        <Select<number>
          aria-label="File attempts"
          popupMatchSelectWidth={false}
          optionLabelProp="title"
          value={selectedDocumentAttemptIndex}
          onChange={onSelectDocumentAttempt}
          options={item.document.attempts.map((attempt) => {
            const title = `File attempt ${attempt.attemptIndex! + 1} (${formatDuration(attempt.durationMs ?? 0)})`;
            return {
              value: attempt.attemptIndex,
              title,
              label: (
                <AttemptOptionLabel title={title} status={attempt.status} />
              ),
            };
          })}
        />
      </div>
    );
  }

  if (item.testCase.attempts.length > 1) {
    return (
      <div className="runner-attempt-select-shell">
        {attemptStatus ? <AttemptStatusBadge status={attemptStatus} /> : null}
        <Select<string>
          aria-label="Attempts"
          popupMatchSelectWidth={false}
          optionLabelProp="title"
          value={selectedAttempt?.attemptId}
          onChange={(attemptId) => {
            const attempt = item.testCase.attempts.find(
              (candidate) => candidate.attemptId === attemptId,
            );
            if (attempt) onSelectAttempt(attempt);
          }}
          options={item.testCase.attempts.map((attempt) => {
            const title = `Attempt ${attempt.attemptIndex + 1} (${formatDuration(attempt.durationMs)})`;
            return {
              value: attempt.attemptId,
              title,
              label: (
                <AttemptOptionLabel title={title} status={attempt.status} />
              ),
            };
          })}
        />
      </div>
    );
  }

  return (
    <span className="runner-single-attempt-label">
      {attemptStatus ? <AttemptStatusBadge status={attemptStatus} /> : null}
      <span>Attempt 1 ({formatDuration(attemptDuration)})</span>
    </span>
  );
}
