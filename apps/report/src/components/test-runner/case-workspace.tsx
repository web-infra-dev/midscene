import { BugOutlined } from '@ant-design/icons';
import type { TestRunReportDump } from '@midscene/core';
import { type ReactNode, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import { RunnerAttemptTimeline } from './attempt-timeline';
import { CaseWorkspaceHeader } from './case-workspace-header';
import {
  getCaseNotRunReason,
  getCaseWorkspaceDocument,
} from './case-workspace-model';
import { ErrorCards } from './error-card';
import { RunnerEvidenceInspector } from './evidence-inspector';
import { RunnerExecutionPanel } from './execution-panel';
import {
  type ReportIssue,
  type ReportIssues,
  collectReportIssues,
} from './issues';
import type { RunnerCaseView, RunnerVisualIndex } from './model';
import { getRunnerCaseStepTargets } from './model';
import { useCaseWorkspace } from './use-case-workspace';

export { getWorkspaceStepSummary } from './use-case-workspace';

export function CaseWorkspace({
  item,
  standaloneRun,
  issues,
  visualIndex,
  reports,
  initialStepId,
  renderAgentReport,
  onBack,
  backLabel,
}: {
  item: RunnerCaseView;
  standaloneRun?: TestRunReportDump;
  issues?: ReportIssues;
  visualIndex: RunnerVisualIndex;
  reports: PlaywrightTasks[];
  initialStepId?: string;
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
  backLabel: string;
}): JSX.Element {
  const [executionView, setExecutionView] = useState<'visual' | 'yaml'>(
    'visual',
  );
  const {
    activeFrame,
    activePosition,
    inspectorTab,
    lockedFrameKey,
    positionedFrames,
    previewFrameKey,
    selectedAttempt,
    selectedDocumentAttemptIndex,
    selectedStep,
    selectAttempt,
    selectDocumentAttempt,
    selectFrame,
    selectInspectorTab,
    selectStep,
    setPreviewFrameKey,
    stepGroups,
    stepSummary,
    workspaceSteps,
    timelineRange,
  } = useCaseWorkspace({ item, initialStepId, visualIndex });
  const navigableStepIds = new Set(
    getRunnerCaseStepTargets(item).map(({ step }) => step.id),
  );

  const document = getCaseWorkspaceDocument(
    item,
    selectedAttempt,
    selectedDocumentAttemptIndex,
  );
  const reportIssues =
    issues ??
    collectReportIssues(
      standaloneRun ?? {
        projects: [{ ...item.project, documents: [item.document] }],
      },
    );
  const scopeIds = new Set([
    item.project.projectId,
    document.documentRunId ?? document.documentId,
    selectedAttempt?.attemptId,
  ]);
  const otherIssues: ReportIssue[] = reportIssues.others
    .filter(
      (issue) =>
        (!issue.projectId || issue.projectId === item.project.projectId) &&
        (!issue.documentId || issue.documentId === item.document.documentId) &&
        (!issue.documentId || !issue.scopeId || scopeIds.has(issue.scopeId)),
    )
    .map((issue) => ({
      ...issue,
      label:
        selectedAttempt && issue.scopeId === selectedAttempt.attemptId
          ? `Case · Attempt ${selectedAttempt!.attemptIndex + 1} · ${issue.label?.split(' · ').at(-1)}`
          : issue.documentId
            ? `Document · ${issue.label?.split(' · ').at(-1)}`
            : issue.label,
    }));
  const plannedStep = selectedStep
    ? [
        ...(document.plan?.beforeAll ?? []),
        ...(item.testCase.plan?.beforeEach ?? []),
        ...(item.testCase.plan?.steps ?? []),
        ...(item.testCase.plan?.afterEach ?? []),
        ...(document.plan?.afterAll ?? []),
      ].find((step) =>
        selectedStep.planStepId
          ? step.id === selectedStep.planStepId
          : step.phase === selectedStep.phase &&
            step.stepIndex === selectedStep.stepIndex &&
            step.node === selectedStep.node,
      )
    : undefined;
  if (
    !workspaceSteps.length &&
    !selectedAttempt &&
    !otherIssues.some((issue) => issue.severity === 'error')
  ) {
    const reason = getCaseNotRunReason(item);
    if (reason)
      otherIssues.push({
        id: `not-started:${item.testCase.caseId}`,
        severity: 'warning',
        code: 'CASE_NOT_STARTED',
        message: reason,
      });
  }

  return (
    <div className="runner-page runner-case-workspace">
      <CaseWorkspaceHeader
        item={item}
        standaloneRun={standaloneRun}
        selectedAttempt={selectedAttempt}
        selectedDocumentAttemptIndex={selectedDocumentAttemptIndex}
        backLabel={backLabel}
        onBack={onBack}
        onSelectAttempt={selectAttempt}
        onSelectDocumentAttempt={selectDocumentAttempt}
        stepSummary={stepSummary}
      >
        <ErrorCards
          issues={otherIssues}
          label="Other issues"
          navigableStepIds={navigableStepIds}
        />
      </CaseWorkspaceHeader>

      {workspaceSteps.length > 0 ? (
        <div className="runner-detail-debug-workbench">
          <RunnerExecutionPanel
            groups={stepGroups}
            issues={reportIssues.nodes}
            selectedStepId={selectedStep?.id}
            timeline={
              timelineRange ? (
                <RunnerAttemptTimeline
                  attempt={timelineRange}
                  frames={positionedFrames}
                  selectedStepId={selectedStep?.id}
                  previewFrameKey={previewFrameKey}
                  lockedFrameKey={lockedFrameKey}
                  variant="detail"
                  onPreview={setPreviewFrameKey}
                  onSelectFrame={selectFrame}
                />
              ) : undefined
            }
            view={executionView}
            onViewChange={setExecutionView}
            sourcePath={item.document.sourcePath}
            sourceYaml={item.document.plan?.sourceYaml}
            caseIndex={item.testCase.caseIndex}
            onSelect={selectStep}
          >
            {selectedStep ? (
              <RunnerEvidenceInspector
                key={`${selectedAttempt?.attemptId ?? 'document'}:${selectedStep.id}`}
                item={item}
                attempt={selectedAttempt}
                step={selectedStep}
                plannedStep={plannedStep}
                issues={reportIssues.nodes.get(selectedStep.id)}
                navigableStepIds={navigableStepIds}
                activeFrame={activeFrame}
                activePosition={activePosition}
                tab={inspectorTab}
                reports={reports}
                renderAgentReport={renderAgentReport}
                onTabChange={selectInspectorTab}
              />
            ) : (
              <div className="runner-select-step-hint">
                <BugOutlined />
                Select a Step to inspect its evidence and runtime data.
              </div>
            )}
          </RunnerExecutionPanel>
        </div>
      ) : null}
    </div>
  );
}
