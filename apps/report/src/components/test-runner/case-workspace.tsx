import { BugOutlined } from '@ant-design/icons';
import type { TestRunReportDump } from '@midscene/core';
import type { ReactNode } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  RunnerAttemptTimeline,
  RunnerTimelinePlaybackControl,
} from './attempt-timeline';
import { CaseWorkspaceHeader } from './case-workspace-header';
import {
  getCaseWorkspaceDocument,
  getCaseWorkspaceLifecycleIssues,
} from './case-workspace-model';
import { RunnerEvidenceInspector } from './evidence-inspector';
import { RunnerExecutionPanel } from './execution-panel';
import { LifecycleErrors } from './lifecycle-errors';
import type { RunnerCaseView, RunnerVisualIndex } from './model';
import { getRunnerCaseStepTargets } from './model';
import { ScopeOutcome } from './scope-outcome';
import { useCaseWorkspace } from './use-case-workspace';

export { getWorkspaceStepSummary } from './use-case-workspace';

export function CaseWorkspace({
  item,
  standaloneRun,
  visualIndex,
  reports,
  initialStepId,
  renderAgentReport,
  onBack,
  backLabel,
}: {
  item: RunnerCaseView;
  standaloneRun?: TestRunReportDump;
  visualIndex: RunnerVisualIndex;
  reports: PlaywrightTasks[];
  initialStepId?: string;
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
  backLabel: string;
}): JSX.Element {
  const {
    activeFrame,
    activePosition,
    inspectorTab,
    isPlaying,
    lockedFrameKey,
    positionedFrames,
    playingStepId,
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
    togglePlayback,
    workspaceSteps,
    timelineRange,
  } = useCaseWorkspace({ item, initialStepId, visualIndex });
  const navigableStepIds = new Set(
    getRunnerCaseStepTargets(item).map(({ step }) => step.id),
  );

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
      />

      <LifecycleErrors
        issues={getCaseWorkspaceLifecycleIssues(
          item,
          selectedAttempt,
          selectedDocumentAttemptIndex,
        )}
      />
      <ScopeOutcome
        value={getCaseWorkspaceDocument(
          item,
          selectedAttempt,
          selectedDocumentAttemptIndex,
        )}
        label="Document lifecycle"
        navigableStepIds={navigableStepIds}
      />
      {selectedAttempt ? (
        <ScopeOutcome
          value={selectedAttempt}
          label={`Case attempt ${selectedAttempt.attemptIndex + 1}`}
          navigableStepIds={navigableStepIds}
        />
      ) : null}

      {workspaceSteps.length > 0 ? (
        <div className="runner-detail-debug-workbench">
          <RunnerExecutionPanel
            groups={stepGroups}
            selectedStepId={selectedStep?.id}
            playingStepId={playingStepId}
            timeline={
              timelineRange ? (
                <RunnerAttemptTimeline
                  attempt={timelineRange}
                  frames={positionedFrames}
                  selectedStepId={selectedStep?.id}
                  previewFrameKey={previewFrameKey}
                  lockedFrameKey={lockedFrameKey}
                  isPlaying={isPlaying}
                  variant="detail"
                  onPreview={setPreviewFrameKey}
                  onSelectFrame={selectFrame}
                  onTogglePlay={togglePlayback}
                />
              ) : undefined
            }
            timelineControl={
              timelineRange ? (
                <RunnerTimelinePlaybackControl
                  frameCount={positionedFrames.length}
                  isPlaying={isPlaying}
                  compact
                  onTogglePlay={togglePlayback}
                />
              ) : undefined
            }
            onSelect={selectStep}
          />
          {selectedStep ? (
            <RunnerEvidenceInspector
              key={`${selectedAttempt?.attemptId ?? 'document'}:${selectedStep.id}`}
              item={item}
              attempt={selectedAttempt}
              step={selectedStep}
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
        </div>
      ) : null}
    </div>
  );
}
