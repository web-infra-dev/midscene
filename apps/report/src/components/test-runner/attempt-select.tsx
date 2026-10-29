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
      <AttemptStatusBadge
        className="runner-attempt-option-status"
        status={status}
      />
      <span className="runner-attempt-option-title">{title}</span>
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
}): JSX.Element | null {
  const documentAttempts = item.document.attempts;
  if (documentAttempts && documentAttempts.length > 1) {
    return (
      <div className="runner-attempt-select-shell">
        <Select<number>
          aria-label="File attempts"
          popupMatchSelectWidth
          optionLabelProp="label"
          value={selectedDocumentAttemptIndex}
          onChange={onSelectDocumentAttempt}
          options={documentAttempts.map((attempt) => {
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
        <Select<string>
          aria-label="Attempts"
          popupMatchSelectWidth
          optionLabelProp="label"
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

  return null;
}
