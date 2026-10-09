import { EyeOutlined, PictureOutlined } from '@ant-design/icons';
import type {
  TestRunReportAttempt,
  TestRunReportError,
  TestRunReportPlannedStep,
  TestRunReportStep,
} from '@midscene/core';
import type { ReactNode } from 'react';
import type { PlaywrightTasks } from '../../types';
import { formatTimelineTime } from '../timeline/timeline-scale';
import { RunnerAgentTraceContent, getAgentReportIssues } from './agent-trace';
import { ErrorCards } from './error-card';
import { EvidenceTabs, type RunnerInspectorTab } from './evidence-tabs';
import { type ReportIssue, getStepIssues } from './issues';
import type {
  RunnerCaseView,
  RunnerPositionedVisualFrame,
  RunnerVisualFrame,
} from './model';
import { getStepDisplayName } from './model';
import { CaseStatus } from './view-primitives';

export function RunnerEvidenceInspector({
  item,
  attempt,
  step,
  plannedStep,
  issues,
  navigableStepIds,
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
  plannedStep?: TestRunReportPlannedStep;
  issues?: readonly ReportIssue[];
  navigableStepIds?: ReadonlySet<string>;
  activeFrame?: RunnerVisualFrame;
  activePosition?: RunnerPositionedVisualFrame;
  tab: RunnerInspectorTab;
  reports: PlaywrightTasks[];
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onTabChange(tab: RunnerInspectorTab): void;
}): JSX.Element {
  const hasAgentTrace = Boolean(
    step.agentDetails?.some((detail) =>
      reports.some((report) => report.reportId === detail.reportId),
    ),
  );
  const stepDescription = getStepDisplayName(step);
  const nodeIssues = [
    ...(issues ?? getStepIssues(step)),
    ...getAgentReportIssues(step, reports),
  ];
  const knownErrors = new Set<string>();
  const remember = (error: TestRunReportError) => {
    knownErrors.add(JSON.stringify(error));
    if (error.cause) remember(error.cause);
    for (const child of error.errors ?? []) remember(child);
  };
  for (const issue of nodeIssues) if (issue.error) remember(issue.error);
  for (const event of step.operations?.events ?? []) {
    if (!event.error || knownErrors.has(JSON.stringify(event.error))) continue;
    remember(event.error);
    nodeIssues.push({
      id: `${event.operationId}:${event.kind}`,
      severity: 'warning',
      code: 'OPERATION_ERROR',
      message: event.error.message,
      error: event.error,
      context: {
        operationId: event.operationId,
        kind: event.kind,
        at: event.at,
      },
    });
  }
  const stepIds =
    navigableStepIds ?? new Set(step.blockedBy ? [step.blockedBy] : []);

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

  return (
    <section className="runner-detail-evidence-panel">
      <header className="runner-detail-evidence-heading">
        <div className="runner-detail-evidence-title">
          <h2>{step.node}</h2>
          <CaseStatus
            status={step.status === 'success' ? 'passed' : step.status}
            quiet
          />
        </div>
        {stepDescription !== step.node ? (
          <p className="runner-detail-step-description">{stepDescription}</p>
        ) : null}
      </header>
      <ErrorCards
        issues={nodeIssues}
        label="Node issues"
        navigableStepIds={stepIds}
        currentStepId={step.id}
      />
      <section className="runner-detail-inspector">
        <div className="runner-detail-tabs-row">
          <EvidenceTabs
            step={step}
            plannedStep={plannedStep}
            issues={nodeIssues}
            navigableStepIds={stepIds}
            context={{
              projectId: item.project.projectId,
              caseId: item.testCase.caseId,
              ...(attempt ? { attemptId: attempt.attemptId } : {}),
              stepId: step.id,
            }}
            tab={tab}
            onChange={onTabChange}
            recordContent={recordContent}
            stabilizeContentHeight={hasAgentTrace}
          />
        </div>
      </section>
    </section>
  );
}
