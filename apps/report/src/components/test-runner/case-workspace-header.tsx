import { ArrowLeftOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportDump } from '@midscene/core';
import type { RunnerCaseView } from './model';
import { SingleCaseRunInfo } from './single-case-run-info';
import { CaseStatus, StepStatus, formatDuration } from './view-primitives';

export function CaseWorkspaceHeader({
  item,
  selectedAttempt,
  backLabel,
  onBack,
  onSelectAttempt,
  standaloneRun,
}: {
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  backLabel: string;
  onBack(): void;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
  standaloneRun?: TestRunReportDump;
}): JSX.Element {
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
            <span>{item.document.sourcePath}</span>
            <span>
              {item.testCase.attempts.length}{' '}
              {item.testCase.attempts.length === 1 ? 'attempt' : 'attempts'}
            </span>
            <span>{formatDuration(item.durationMs)} total</span>
          </div>
        </div>
      </div>
      {standaloneRun && <SingleCaseRunInfo dump={standaloneRun} />}
      {item.testCase.attempts.length > 1 ? (
        <section className="runner-attempt-switcher" aria-label="Attempts">
          {item.testCase.attempts.map((attempt) => (
            <button
              type="button"
              key={attempt.attemptId}
              aria-label={`Attempt ${attempt.attemptIndex + 1}, ${attempt.status}, ${formatDuration(attempt.durationMs)}`}
              aria-pressed={selectedAttempt?.attemptId === attempt.attemptId}
              className={
                selectedAttempt?.attemptId === attempt.attemptId
                  ? 'is-selected'
                  : ''
              }
              onClick={() => onSelectAttempt(attempt)}
            >
              <StepStatus status={attempt.status} />
              <span>
                <strong>Attempt {attempt.attemptIndex + 1}</strong>
                <small>{formatDuration(attempt.durationMs)}</small>
              </span>
            </button>
          ))}
        </section>
      ) : null}
      {!item.testCase.attempts.length ? (
        <div className="runner-not-run-message">
          <ClockCircleOutlined />
          {item.testCase.notRunReason || 'This case was not executed.'}
        </div>
      ) : null}
    </section>
  );
}
