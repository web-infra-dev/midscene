import { BugOutlined } from '@ant-design/icons';
import type {
  TestRunReportAttempt,
  TestRunReportDump,
  TestRunReportStep,
} from '@midscene/core';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import {
  clearRunnerStepHash,
  updateRunnerStepHash,
} from '../../utils/test-run-report';
import { RunnerTracePage } from './agent-trace';
import { RunnerAttemptTimeline } from './attempt-timeline';
import { CaseWorkspaceHeader } from './case-workspace-header';
import {
  getCaseWorkspaceStepGroups,
  getDefaultCaseWorkspaceStep,
} from './case-workspace-model';
import { RunnerEvidenceInspector } from './evidence-inspector';
import type { RunnerInspectorTab } from './evidence-tabs';
import { RunnerExecutionPanel } from './execution-panel';
import {
  type RunnerCaseView,
  type RunnerPositionedVisualFrame,
  type RunnerVisualIndex,
  flattenAttemptSteps,
  getDefaultVisualFrameForStep,
  getStepForVisualFrame,
  getVisualFrames,
  positionAttemptVisualFrames,
} from './model';

import { LifecycleErrors } from './lifecycle-errors';

export function CaseWorkspace({
  item,
  standaloneRun,
  visualIndex,
  reports,
  initialStepId,
  tracePage,
  renderAgentReport,
  onBack,
  onCloseTracePage,
  backLabel,
}: {
  item: RunnerCaseView;
  standaloneRun?: TestRunReportDump;
  visualIndex: RunnerVisualIndex;
  reports: PlaywrightTasks[];
  initialStepId?: string;
  tracePage: boolean;
  renderAgentReport(reports: PlaywrightTasks[]): ReactNode;
  onBack(): void;
  onCloseTracePage(): void;
  backLabel: string;
}): JSX.Element {
  const initialAttempt =
    item.testCase.attempts.find((attempt) =>
      flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
    ) ?? item.finalAttempt;
  const initialWorkspaceSteps = getCaseWorkspaceStepGroups(
    item,
    initialAttempt,
  ).flatMap((group) => group.steps);
  const initialStep =
    initialWorkspaceSteps.find((step) => step.id === initialStepId) ??
    getDefaultCaseWorkspaceStep(item, initialAttempt);
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    initialAttempt?.attemptId,
  );
  const [selectedStepId, setSelectedStepId] = useState(initialStep?.id);
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const [lockedFrameKey, setLockedFrameKey] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<RunnerInspectorTab>('io');
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);

  useEffect(() => {
    const nextAttempt =
      item.testCase.attempts.find((attempt) =>
        flattenAttemptSteps(attempt).some((step) => step.id === initialStepId),
      ) ?? item.finalAttempt;
    const nextSteps = getCaseWorkspaceStepGroups(item, nextAttempt).flatMap(
      (group) => group.steps,
    );
    const nextStep =
      nextSteps.find((step) => step.id === initialStepId) ??
      getDefaultCaseWorkspaceStep(item, nextAttempt);
    setSelectedAttemptId(nextAttempt?.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
  }, [initialStepId, item.finalAttempt, item.key, item.testCase.attempts]);

  const selectedAttempt =
    item.testCase.attempts.find(
      (attempt) => attempt.attemptId === selectedAttemptId,
    ) ?? item.finalAttempt;
  const stepGroups = useMemo(
    () => getCaseWorkspaceStepGroups(item, selectedAttempt),
    [item, selectedAttempt],
  );
  const workspaceSteps = useMemo(
    () => stepGroups.flatMap((group) => group.steps),
    [stepGroups],
  );

  const selectedStep =
    workspaceSteps.find((step) => step.id === selectedStepId) ??
    getDefaultCaseWorkspaceStep(item, selectedAttempt);
  const visualFrames = useMemo(
    () =>
      getVisualFrames(
        workspaceSteps.flatMap((step) => step.agentDetails ?? []),
        visualIndex,
        Number.POSITIVE_INFINITY,
      ),
    [workspaceSteps, visualIndex],
  );
  const positionedFrames = useMemo(
    () =>
      selectedAttempt
        ? positionAttemptVisualFrames(selectedAttempt, visualFrames)
        : [],
    [selectedAttempt, visualFrames],
  );
  const previewFrame = visualFrames.find(
    (frame) => frame.key === previewFrameKey,
  );
  const lockedFrame = visualFrames.find(
    (frame) => frame.key === lockedFrameKey,
  );
  const defaultStepFrame = selectedStep
    ? getDefaultVisualFrameForStep(selectedStep, visualFrames)
    : visualFrames[0];
  const activeFrame = previewFrame ?? lockedFrame ?? defaultStepFrame;
  const activePosition = positionedFrames.find(
    (item) => item.frame.key === activeFrame?.key,
  );

  useEffect(() => {
    if (!isPlaying || !positionedFrames.length) return;
    const advance = () => {
      const nextFrame = positionedFrames[playbackIndexRef.current];
      if (!nextFrame) {
        setIsPlaying(false);
        return;
      }
      setPreviewFrameKey(undefined);
      setLockedFrameKey(nextFrame.frame.key);
      if (nextFrame.stepId) {
        setSelectedStepId(nextFrame.stepId);
        updateRunnerStepHash(nextFrame.stepId);
      }
      setInspectorTab('io');
      setTraceDrawerOpen(false);
      playbackIndexRef.current += 1;
    };
    advance();
    const interval = window.setInterval(advance, 900);
    return () => window.clearInterval(interval);
  }, [isPlaying, positionedFrames]);

  const selectAttempt = (attempt: TestRunReportAttempt) => {
    const nextStep = getDefaultCaseWorkspaceStep(item, attempt);
    setSelectedAttemptId(attempt.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
    clearRunnerStepHash();
  };
  const selectStep = (step: TestRunReportStep) => {
    setSelectedStepId(step.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(getDefaultVisualFrameForStep(step, visualFrames)?.key);
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
    updateRunnerStepHash(step.id);
  };
  const selectFrame = (item: RunnerPositionedVisualFrame) => {
    setPreviewFrameKey(undefined);
    setLockedFrameKey(item.frame.key);
    const owningStep = getStepForVisualFrame(workspaceSteps, item.frame);
    if (owningStep) {
      setSelectedStepId(owningStep.id);
      updateRunnerStepHash(owningStep.id);
    }
    setInspectorTab('io');
    setTraceDrawerOpen(false);
    setIsPlaying(false);
  };
  const selectInspectorTab = (tab: RunnerInspectorTab) => {
    setInspectorTab(tab);
  };
  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const lockedIndex = positionedFrames.findIndex(
      (item) => item.frame.key === lockedFrameKey,
    );
    playbackIndexRef.current =
      lockedIndex < 0 || lockedIndex >= positionedFrames.length - 1
        ? 0
        : lockedIndex + 1;
    if (playbackIndexRef.current === 0) setLockedFrameKey(undefined);
    setIsPlaying(true);
  };

  if (tracePage && selectedStep?.agentDetails?.length) {
    return (
      <RunnerTracePage
        item={item}
        attempt={selectedAttempt}
        step={selectedStep}
        reports={reports}
        renderAgentReport={renderAgentReport}
        onBack={onCloseTracePage}
      />
    );
  }

  return (
    <div className="runner-page runner-case-workspace">
      <CaseWorkspaceHeader
        item={item}
        standaloneRun={standaloneRun}
        selectedAttempt={selectedAttempt}
        backLabel={backLabel}
        onBack={onBack}
        onSelectAttempt={selectAttempt}
      />

      <LifecycleErrors
        issues={(selectedAttempt?.teardownErrors ?? []).map((error) => ({
          label: `Attempt ${selectedAttempt!.attemptIndex + 1}: Case teardown failed`,
          error,
        }))}
      />
      {workspaceSteps.length > 0 ? (
        <>
          {selectedAttempt && (
            <RunnerAttemptTimeline
              attempt={selectedAttempt}
              frames={positionedFrames}
              selectedStepId={selectedStep?.id}
              previewFrameKey={previewFrameKey}
              lockedFrameKey={lockedFrameKey}
              isPlaying={isPlaying}
              onPreview={setPreviewFrameKey}
              onSelectFrame={selectFrame}
              onTogglePlay={togglePlayback}
            />
          )}
          <div className="runner-detail-debug-workbench">
            <RunnerExecutionPanel
              groups={stepGroups}
              selectedStepId={selectedStep?.id}
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
                traceDrawerOpen={traceDrawerOpen}
                reports={reports}
                renderAgentReport={renderAgentReport}
                onTabChange={selectInspectorTab}
                onTraceDrawerOpenChange={setTraceDrawerOpen}
              />
            ) : (
              <div className="runner-select-step-hint">
                <BugOutlined />
                Select a Step to inspect its evidence and runtime data.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
