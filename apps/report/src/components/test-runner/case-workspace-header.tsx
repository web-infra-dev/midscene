import { ArrowLeftOutlined } from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportDump } from '@midscene/core';
import { type ReactNode, useMemo } from 'react';
import type { PlaywrightTasks } from '../../types';
import { AttemptSelect } from './attempt-select';
import {
  type RunnerCaseView,
  flattenAttemptSteps,
  getCaseTokenSummary,
} from './model';
import { SingleCaseRunInfo } from './single-case-run-info';
import { StatusBadge } from './status-badge';
import { TokenUsageTooltip } from './token-usage';
import { CaseStatus, formatDuration } from './view-primitives';

export function CaseWorkspaceHeader({
  item,
  backLabel,
  onBack,
  standaloneRun,
  reports,
  caseNavigation,
  children,
}: {
  item: RunnerCaseView;
  backLabel: string;
  onBack(): void;
  standaloneRun?: TestRunReportDump;
  reports?: PlaywrightTasks[];
  caseNavigation?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  const tokens = getCaseTokenSummary(item.testCase);
  const details = useMemo(
    () =>
      item.testCase.attempts
        .flatMap(flattenAttemptSteps)
        .filter((step) => step.status !== 'not-run')
        .flatMap((step) => step.agentDetails ?? []),
    [item.testCase],
  );
  return (
    <section className="runner-detail-case-header">
      {caseNavigation}
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
            <CaseStatus
              status={item.status}
              recovered={!item.firstPass}
              quiet
            />
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
            <TokenUsageTooltip
              usage={tokens}
              reports={reports}
              details={details}
              scope="case"
            >
              Tokens
              <strong>
                {tokens.status === 'unknown'
                  ? '—'
                  : tokens.totalTokens.toLocaleString()}
              </strong>
              {tokens.status === 'partial' ? '(partial)' : null}
            </TokenUsageTooltip>
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
      {standaloneRun && (
        <SingleCaseRunInfo dump={standaloneRun} reports={reports} />
      )}
      {children}
    </section>
  );
}

export function CaseExecutionToolbar({
  item,
  selectedAttempt,
  selectedDocumentAttemptIndex,
  onSelectAttempt,
  onSelectDocumentAttempt,
  stepSummary,
  viewSwitch,
}: {
  viewSwitch: ReactNode;
  item: RunnerCaseView;
  selectedAttempt?: TestRunReportAttempt;
  selectedDocumentAttemptIndex?: number;
  onSelectAttempt(attempt: TestRunReportAttempt): void;
  onSelectDocumentAttempt?(attemptIndex: number): void;
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
    <div className="runner-case-run-bar">
      <div className="runner-execution-controls">
        {viewSwitch}

        <AttemptSelect
          item={item}
          selectedAttempt={selectedAttempt}
          selectedDocumentAttemptIndex={selectedDocumentAttemptIndex}
          onSelectAttempt={onSelectAttempt}
          onSelectDocumentAttempt={onSelectDocumentAttempt}
        />
      </div>
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
  );
}
