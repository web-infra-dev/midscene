import {
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  EyeOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import { formatTimelineTime } from '../timeline/timeline-scale';
import { RunnerAgentTraceContent } from './agent-trace';
import { EvidenceTabs, type RunnerInspectorTab } from './evidence-tabs';
import type {
  RunnerCaseView,
  RunnerPositionedVisualFrame,
  RunnerVisualFrame,
} from './model';
import { getStepDisplayName } from './model';
import { CaseStatus } from './view-primitives';

const copyRunnerText = async (value: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await navigator.clipboard.writeText(value);
};

export function RunnerEvidenceInspector({
  item,
  attempt,
  step,
  activeFrame,
  activePosition,
  tab,
  reports,
  renderAgentReport,
  onTabChange,
}: {
  item: RunnerCaseView;
  attempt?: TestRunReportAttempt;
  step: TestRunReportStep;
  activeFrame?: RunnerVisualFrame;
  activePosition?: RunnerPositionedVisualFrame;
  tab: RunnerInspectorTab;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onTabChange(tab: RunnerInspectorTab): void;
}): JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const hasAgentTrace = Boolean(step.agentDetails?.length);
  const stepDescription = getStepDisplayName(step);
  const copyErrorLabel =
    copyState === 'copied'
      ? 'Copied error details'
      : copyState === 'failed'
        ? 'Copy error details failed'
        : 'Copy error details';

  useEffect(() => setCopyState('idle'), [step.id]);

  const recordContent = hasAgentTrace ? (
    <div className="runner-detail-inline-trace">
      <RunnerAgentTraceContent
        key={step.id}
        step={step}
        reports={reports}
        renderAgentReport={renderAgentReport}
      />
    </div>
  ) : activeFrame ? (
    <div className="runner-detail-record-view">
      <section className="runner-detail-screenshot-stage">
        <div className="runner-detail-screenshot-toolbar">
          <span>
            <PictureOutlined />
            {activeFrame.label || 'Step screenshot'}
          </span>
          <span>
            {activePosition
              ? formatTimelineTime(activePosition.offsetMs)
              : 'Frame'}
          </span>
        </div>
        <div className="runner-detail-screenshot-canvas">
          <img
            alt={`Captured evidence for ${step.node}`}
            src={activeFrame.screenshot.base64}
          />
        </div>
        <div className="runner-detail-screenshot-caption">
          <EyeOutlined />
          Hover the timeline to preview a frame. Click a frame to lock it and
          jump to its owning Step.
        </div>
      </section>
    </div>
  ) : undefined;

  const copyError = async () => {
    try {
      await copyRunnerText(
        [step.error?.code, step.error?.name, step.error?.message]
          .filter(Boolean)
          .join(': '),
      );
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section className="runner-detail-evidence-panel">
      <header className="runner-detail-evidence-heading">
        <div className="runner-detail-evidence-title">
          <h2>{step.node}</h2>
          <CaseStatus
            status={step.status === 'success' ? 'passed' : 'failed'}
            quiet
          />
        </div>
        {stepDescription !== step.node ? (
          <p className="runner-detail-step-description">{stepDescription}</p>
        ) : null}
      </header>
      {step.error ? (
        <div className="runner-detail-failure-summary">
          <CloseCircleFilled className="runner-detail-failure-icon" />
          <span className="runner-detail-failure-content">
            <strong>{step.error.code || step.error.name}</strong>
            <small>{step.error.message}</small>
          </span>
          <button
            type="button"
            aria-label={copyErrorLabel}
            title={copyErrorLabel}
            onClick={copyError}
          >
            <CopyOutlined />
          </button>
        </div>
      ) : null}
      <section className="runner-detail-inspector">
        <div className="runner-detail-tabs-row">
          <EvidenceTabs
            step={step}
            tab={tab}
            onChange={onTabChange}
            recordContent={recordContent}
            stabilizeContentHeight={hasAgentTrace}
          />
        </div>
        <details className="runner-detail-raw-context">
          <summary>
            <CodeOutlined /> Stable IDs and raw context
          </summary>
          <dl>
            <div>
              <dt>Project ID</dt>
              <dd title={item.project.projectId}>{item.project.projectId}</dd>
            </div>
            <div>
              <dt>Case ID</dt>
              <dd title={item.testCase.caseId}>{item.testCase.caseId}</dd>
            </div>
            {attempt && (
              <div>
                <dt>Attempt ID</dt>
                <dd title={attempt.attemptId}>{attempt.attemptId}</dd>
              </div>
            )}
            <div>
              <dt>Step ID</dt>
              <dd title={step.id}>{step.id}</dd>
            </div>
          </dl>
        </details>
      </section>
    </section>
  );
}
