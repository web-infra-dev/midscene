import type { TestRunReportAttempt } from '@midscene/core';
import { Tag } from 'antd';
import type { RunnerCaseView } from './model';
import { Select } from './select';
import { StepStatus, formatDuration } from './view-primitives';

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
      <Tag
        className="runner-attempt-option-status"
        color={status === 'success' ? 'success' : 'error'}
        bordered={false}
      >
        {status === 'success' ? 'Passed' : 'Failed'}
      </Tag>
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
        <span className={`is-${attemptStatus}`}>{attemptStatus}</span>
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
        <span className={`is-${attemptStatus}`}>{attemptStatus}</span>
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
      {attemptStatus ? <StepStatus status={attemptStatus} /> : null}
      Attempt 1 ({formatDuration(attemptDuration)})
    </span>
  );
}
