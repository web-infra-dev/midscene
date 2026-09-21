import {
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  ExportOutlined,
  EyeOutlined,
  PictureOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import { Button, Drawer } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import { formatTimelineTime } from '../timeline/timeline-scale';
import {
  RunnerAgentTraceContent,
  buildRunnerTracePageHref,
} from './agent-trace';
import { EvidenceTabs, type RunnerInspectorTab } from './evidence-tabs';
import type {
  RunnerCaseView,
  RunnerPositionedVisualFrame,
  RunnerVisualFrame,
} from './model';
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
  traceDrawerOpen,
  reports,
  renderAgentReport,
  onTabChange,
  onTraceDrawerOpenChange,
}: {
  item: RunnerCaseView;
  attempt?: TestRunReportAttempt;
  step: TestRunReportStep;
  activeFrame?: RunnerVisualFrame;
  activePosition?: RunnerPositionedVisualFrame;
  tab: RunnerInspectorTab;
  traceDrawerOpen: boolean;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onTabChange(tab: RunnerInspectorTab): void;
  onTraceDrawerOpenChange(open: boolean): void;
}): JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const hasAgentTrace = Boolean(step.agentDetails?.length);
  const tracePageHref = hasAgentTrace
    ? buildRunnerTracePageHref(step.id)
    : undefined;

  useEffect(() => setCopyState('idle'), [step.id]);

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
      <div className="runner-detail-evidence-main">
        <header className="runner-detail-evidence-heading">
          <div>
            <div className="runner-eyebrow">
              {step.phase} · Step {step.stepIndex + 1}
            </div>
            <h2>{step.node}</h2>
          </div>
          <div className="runner-detail-evidence-actions">
            {hasAgentTrace ? (
              <div className="runner-detail-trace-actions">
                <Button
                  type="primary"
                  size="middle"
                  icon={<ThunderboltFilled />}
                  className="runner-detail-trace-open"
                  aria-label="Inspect GUI agent in side drawer"
                  onClick={() => onTraceDrawerOpenChange(true)}
                >
                  Inspect GUI agent
                </Button>
                <Button
                  size="middle"
                  icon={<ExportOutlined />}
                  className="runner-detail-trace-new-page"
                  aria-label="Open AI trace in new tab"
                  href={tracePageHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open AI trace in new tab
                </Button>
              </div>
            ) : null}
            <CaseStatus
              status={step.status === 'success' ? 'passed' : 'failed'}
              quiet
            />
          </div>
          {step.title ? (
            <p className="runner-detail-step-description">{step.title}</p>
          ) : null}
        </header>
        {step.error ? (
          <div className="runner-detail-failure-summary">
            <CloseCircleFilled />
            <span>
              <strong>{step.error.code || step.error.name}</strong>
              <small>{step.error.message}</small>
            </span>
            <button type="button" onClick={copyError}>
              <CopyOutlined />
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy error'}
            </button>
          </div>
        ) : null}
        <section className="runner-detail-screenshot-stage">
          <div className="runner-detail-screenshot-toolbar">
            <span>
              <PictureOutlined />
              {activeFrame?.label || 'Step screenshot'}
            </span>
            <span>
              {activePosition
                ? formatTimelineTime(activePosition.offsetMs)
                : 'No frame'}
            </span>
          </div>
          <div className="runner-detail-screenshot-canvas">
            {activeFrame ? (
              <img
                alt={`Captured evidence for ${step.node}`}
                src={activeFrame.screenshot.base64}
              />
            ) : (
              <div>
                <PictureOutlined />
                <strong>No screenshot for this Step</strong>
                <span>Inspect the Step data and runtime events instead.</span>
              </div>
            )}
          </div>
          {activeFrame && (
            <div className="runner-detail-screenshot-caption">
              <EyeOutlined />
              Hovering the timeline previews frames without changing the locked
              Step. Click a frame to lock it and jump to its owning Step.
            </div>
          )}
        </section>
      </div>
      <section className="runner-detail-inspector">
        <EvidenceTabs step={step} tab={tab} onChange={onTabChange} />
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
      {hasAgentTrace ? (
        <Drawer
          title={`AI trace · ${step.node}`}
          placement="right"
          width="min(1440px, 80vw)"
          getContainer={false}
          rootStyle={{ position: 'fixed' }}
          open={traceDrawerOpen}
          onClose={() => onTraceDrawerOpenChange(false)}
          destroyOnClose
          rootClassName="runner-detail-trace-drawer"
          extra={
            <Button
              className="runner-detail-trace-new-page"
              icon={<ExportOutlined />}
              aria-label="Open AI trace in new tab"
              href={tracePageHref}
              target="_blank"
              rel="noreferrer"
            >
              Open AI trace in new tab
            </Button>
          }
        >
          <RunnerAgentTraceContent
            step={step}
            reports={reports}
            renderAgentReport={renderAgentReport}
          />
        </Drawer>
      ) : null}
    </section>
  );
}
