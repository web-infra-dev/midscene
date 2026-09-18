import { ArrowLeftOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportDump } from '@midscene/core';
import { Tag } from 'antd';
import type { RunnerCaseView } from './model';
import { Select } from './select';
import { SingleCaseRunInfo } from './single-case-run-info';
import { CaseStatus, StepStatus, formatDuration } from './view-primitives';

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

export function CaseWorkspaceHeader({
  item,
  selectedAttempt,
  selectedDocumentAttemptIndex,
  backLabel,
  onBack,
  onSelectAttempt,
  onSelectDocumentAttempt,
  standaloneRun,
  stepSummary,
}: {
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  selectedDocumentAttemptIndex?: number;
  backLabel: string;
  onBack(): void;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
  onSelectDocumentAttempt?(attemptIndex: number): void;
  standaloneRun?: TestRunReportDump;
  stepSummary?: {
    total: number;
    passed: number;
    failed: number;
    timeout: number;
  };
}): JSX.Element {
  const selectedDocumentAttempt = item.document.attempts?.find(
    (attempt) => attempt.attemptIndex === selectedDocumentAttemptIndex,
  );
  const attemptStatus =
    selectedDocumentAttempt?.status ?? selectedAttempt?.status;
  const attemptDuration =
    selectedDocumentAttempt?.durationMs ?? selectedAttempt?.durationMs ?? 0;
  const visibleStepSummary = stepSummary ?? {
    total: 0,
    passed: 0,
    failed: 0,
    timeout: 0,
  };

  return (
    <section className="runner-detail-case-header">
      {!standaloneRun && (
        <button type="button" className="runner-back-button" onClick={onBack}>
          <ArrowLeftOutlined />
          {backLabel}
        </button>
      )}
      <div className="runner-detail-heading-row">
        <div>
          <div className="runner-detail-title-line">
            <h1>{item.testCase.name}</h1>
            <CaseStatus status={item.status} quiet />
          </div>
          <div className="runner-case-meta">
            <span>{item.project.name}</span>
            <span>{item.project.platform}</span>
            <span title={item.document.sourcePath}>
              {item.document.sourcePath}
            </span>
            <span>
              {(item.document.attempts?.length ??
                item.testCase.attempts.length) === 1
                ? 'attempt'
                : 'attempts'}
              <strong>
                {item.document.attempts?.length ??
                  item.testCase.attempts.length}
              </strong>
            </span>
            <span>
              total <strong>{formatDuration(item.durationMs)}</strong>
            </span>
          </div>
        </div>
      </div>
      {standaloneRun && <SingleCaseRunInfo dump={standaloneRun} />}
      <div className="runner-case-run-bar">
        {item.document.attempts ? (
          <div className="runner-attempt-select-shell">
            <span className={`is-${attemptStatus}`}>{attemptStatus}</span>
            <Select<number>
              aria-label="File attempts"
              popupMatchSelectWidth={false}
              optionLabelProp="title"
              value={selectedDocumentAttemptIndex}
              onChange={(attemptIndex: number) =>
                onSelectDocumentAttempt?.(attemptIndex)
              }
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
        ) : item.testCase.attempts.length > 1 ? (
          <div className="runner-attempt-select-shell">
            <span className={`is-${attemptStatus}`}>{attemptStatus}</span>
            <Select<string>
              aria-label="Attempts"
              popupMatchSelectWidth={false}
              optionLabelProp="title"
              value={selectedAttempt?.attemptId}
              onChange={(attemptId: string) => {
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
        ) : (
          <span className="runner-single-attempt-label">
            {attemptStatus ? <StepStatus status={attemptStatus} /> : null}
            Attempt 1 ({formatDuration(attemptDuration)})
          </span>
        )}
        <dl className="runner-case-step-summary">
          <div>
            <dt>Total</dt>
            <dd>{visibleStepSummary.total}</dd>
          </div>
          <div className="is-passed">
            <dt>Passed</dt>
            <dd>{visibleStepSummary.passed}</dd>
          </div>
          <div className="is-failed">
            <dt>failed</dt>
            <dd>{visibleStepSummary.failed}</dd>
          </div>
          <div className="is-timeout">
            <dt>Timeout</dt>
            <dd>{visibleStepSummary.timeout}</dd>
          </div>
        </dl>
      </div>
      {!item.testCase.attempts.length ? (
        <div className="runner-not-run-message">
          <ClockCircleOutlined />
          {item.testCase.notRunReason || 'This case was not executed.'}
        </div>
      ) : null}
    </section>
  );
}
