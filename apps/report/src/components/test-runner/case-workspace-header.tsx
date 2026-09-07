import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { TestRunReportAttempt } from '@midscene/core';
import type { RunnerCaseView } from './model';
import { CaseStatus, StepStatus, formatDuration } from './view-primitives';

export type CopyLinkState = 'idle' | 'copied' | 'failed';

export function CaseWorkspaceHeader({
  item,
  selectedAttempt,
  backLabel,
  copyLinkState,
  onBack,
  onCopyLink,
  onSelectAttempt,
}: {
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  backLabel: string;
  copyLinkState: CopyLinkState;
  onBack(): void;
  onCopyLink(): void;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
}): JSX.Element {
  return (
    <section className="runner-detail-case-header">
      <button type="button" className="runner-back-button" onClick={onBack}>
        <ArrowLeftOutlined />
        {backLabel}
      </button>
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
        <button
          type="button"
          className="runner-detail-copy-link"
          onClick={onCopyLink}
        >
          <LinkOutlined />
          {copyLinkState === 'copied'
            ? 'Copied'
            : copyLinkState === 'failed'
              ? 'Copy failed'
              : 'Copy case link'}
        </button>
      </div>
      {item.testCase.attempts.length > 1 ? (
        <section className="runner-attempt-switcher" aria-label="Attempts">
          {item.testCase.attempts.map((attempt, index) => (
            <button
              type="button"
              key={attempt.attemptId}
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
                <small>
                  {formatDuration(attempt.durationMs)} · {attempt.status}
                </small>
              </span>
              <em>
                {attempt.status === 'failed' && index === 0
                  ? 'Original failure'
                  : index === item.testCase.attempts.length - 1
                    ? 'Final result'
                    : attempt.status}
              </em>
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
