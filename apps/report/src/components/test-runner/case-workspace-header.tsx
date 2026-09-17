import { ArrowLeftOutlined } from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportDump } from '@midscene/core';
import type { ReactNode } from 'react';
import { AttemptSelect } from './attempt-select';
import type { RunnerCaseView } from './model';
import { SingleCaseRunInfo } from './single-case-run-info';
import { StatusBadge } from './status-badge';
import { CaseStatus, formatDuration } from './view-primitives';

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
  children,
}: {
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  selectedDocumentAttemptIndex?: number;
  backLabel: string;
  onBack(): void;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
  onSelectDocumentAttempt?(attemptIndex: number): void;
  standaloneRun?: TestRunReportDump;
  children?: ReactNode;
  stepSummary?: {
    total: number;
    passed: number;
    failed: number;
    timeout: number;
    notRun?: number;
  };
}): JSX.Element {
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
            {standaloneRun?.status === 'failed' && item.status !== 'failed' ? (
              <StatusBadge label="Run failed" tone="failed" />
            ) : null}
          </div>
          <div className="runner-case-meta">
            <span>{item.project.name}</span>
            {item.project.platform ? (
              <span>{item.project.platform}</span>
            ) : null}
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
              Case time{' '}
              <strong>
                {formatDuration(
                  item.testCase.attempts.length ? item.durationMs : undefined,
                )}
              </strong>
            </span>
          </div>
        </div>
      </div>
      {item.testCase.execution ? (
        <section
          className="runner-executor-details"
          aria-label="Executor details"
        >
          <dl>
            <div>
              <dt>Executor</dt>
              <dd>{item.testCase.execution.executor}</dd>
            </div>
            <div>
              <dt>Executor attempts</dt>
              <dd>{item.testCase.execution.attempts ?? 1}</dd>
            </div>
            <div>
              <dt>Resources</dt>
              <dd>{item.testCase.execution.resources.join(', ') || 'None'}</dd>
            </div>
            {item.testCase.execution.failure ? (
              <div>
                <dt>Executor failure</dt>
                <dd>
                  {item.testCase.execution.failure.kind}:{' '}
                  {item.testCase.execution.failure.message}
                </dd>
              </div>
            ) : null}
          </dl>
          {item.testCase.execution.artifacts?.length ? (
            <div className="runner-executor-artifacts">
              <strong>Artifacts</strong>
              <ul>
                {item.testCase.execution.artifacts.map((artifact) => (
                  <li key={`${artifact.name}:${artifact.uri}`}>
                    <span>{artifact.name}</span>
                    <code>{artifact.uri}</code>
                    {artifact.mediaType ? <em>{artifact.mediaType}</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.testCase.execution.metadata ? (
            <div className="runner-executor-metadata">
              <strong>Metadata</strong>
              <code>{JSON.stringify(item.testCase.execution.metadata)}</code>
            </div>
          ) : null}
        </section>
      ) : null}
      {standaloneRun && <SingleCaseRunInfo dump={standaloneRun} />}
      {children}
      <div className="runner-case-run-bar">
        <AttemptSelect
          item={item}
          selectedAttempt={selectedAttempt}
          selectedDocumentAttemptIndex={selectedDocumentAttemptIndex}
          onSelectAttempt={onSelectAttempt}
          onSelectDocumentAttempt={onSelectDocumentAttempt}
        />
        <dl className="runner-case-step-summary">
          <div>
            <dt>Total steps</dt>
            <dd>{visibleStepSummary.total}</dd>
          </div>
          <div className="is-passed">
            <dt>Success</dt>
            <dd>{visibleStepSummary.passed}</dd>
          </div>
          <div className="is-failed">
            <dt>Failed</dt>
            <dd>{visibleStepSummary.failed}</dd>
          </div>
          <div className="is-timeout">
            <dt>Timeout</dt>
            <dd>{visibleStepSummary.timeout}</dd>
          </div>
          <div>
            <dt>Not run</dt>
            <dd>{visibleStepSummary.notRun ?? 0}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
