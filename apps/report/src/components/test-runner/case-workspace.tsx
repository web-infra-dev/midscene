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
  getCaseWorkspaceDocument,
  getCaseWorkspaceDocumentAttemptIndex,
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
  getDefaultVisualFrameForStep,
  getStepForVisualFrame,
  getVisualFrames,
  positionAttemptVisualFrames,
} from './model';

import { LifecycleErrors } from './lifecycle-errors';

export function getWorkspaceStepSummary(steps: readonly TestRunReportStep[]): {
  total: number;
  passed: number;
  failed: number;
  timeout: number;
} {
  const timeout = steps.filter((step) => {
    if (step.status !== 'failed' || !step.error) return false;
    return /timeout|timed out/i.test(
      [step.error.code, step.error.name, step.error.message]
        .filter(Boolean)
        .join(' '),
    );
  }).length;
  const failed =
    steps.filter((step) => step.status === 'failed').length - timeout;

  return {
    total: steps.length,
    passed: steps.filter((step) => step.status === 'success').length,
    failed,
    timeout,
  };
}

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
  const initialDocumentAttemptIndex = getCaseWorkspaceDocumentAttemptIndex(
    item,
    initialStepId,
  );
  const initialAttempt =
    initialDocumentAttemptIndex !== undefined
      ? item.testCase.attempts.find(
          (attempt) => attempt.attemptIndex === initialDocumentAttemptIndex,
        )
      : (item.testCase.attempts.find((attempt) =>
          getCaseWorkspaceStepGroups(item, attempt).some((group) =>
            group.steps.some((step) => step.id === initialStepId),
          ),
        ) ?? item.finalAttempt);
  const initialWorkspaceSteps = getCaseWorkspaceStepGroups(
    item,
    initialAttempt,
    initialDocumentAttemptIndex,
  ).flatMap((group) => group.steps);
  const initialStep =
    initialWorkspaceSteps.find((step) => step.id === initialStepId) ??
    getDefaultCaseWorkspaceStep(
      item,
      initialAttempt,
      initialDocumentAttemptIndex,
    );
  const [selectedDocumentAttemptIndex, setSelectedDocumentAttemptIndex] =
    useState(initialDocumentAttemptIndex);
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    initialAttempt?.attemptId,
  );
  const [selectedStepId, setSelectedStepId] = useState(initialStep?.id);
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const [lockedFrameKey, setLockedFrameKey] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<RunnerInspectorTab>(
    initialStep?.agentDetails?.length ? 'record' : 'io',
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);

  useEffect(() => {
    const nextDocumentAttemptIndex = getCaseWorkspaceDocumentAttemptIndex(
      item,
      initialStepId,
    );
    const nextAttempt =
      nextDocumentAttemptIndex !== undefined
        ? item.testCase.attempts.find(
            (attempt) => attempt.attemptIndex === nextDocumentAttemptIndex,
          )
        : (item.testCase.attempts.find((attempt) =>
            getCaseWorkspaceStepGroups(item, attempt).some((group) =>
              group.steps.some((step) => step.id === initialStepId),
            ),
          ) ?? item.finalAttempt);
    const nextSteps = getCaseWorkspaceStepGroups(
      item,
      nextAttempt,
      nextDocumentAttemptIndex,
    ).flatMap((group) => group.steps);
    const nextStep =
      nextSteps.find((step) => step.id === initialStepId) ??
      getDefaultCaseWorkspaceStep(item, nextAttempt, nextDocumentAttemptIndex);
    setSelectedDocumentAttemptIndex(nextDocumentAttemptIndex);
    setSelectedAttemptId(nextAttempt?.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab(nextStep?.agentDetails?.length ? 'record' : 'io');
    setIsPlaying(false);
  }, [initialStepId, item]);

  const selectedAttempt =
    selectedDocumentAttemptIndex !== undefined
      ? item.testCase.attempts.find(
          (attempt) => attempt.attemptIndex === selectedDocumentAttemptIndex,
        )
      : (item.testCase.attempts.find(
          (attempt) => attempt.attemptId === selectedAttemptId,
        ) ?? item.finalAttempt);
  const stepGroups = useMemo(
    () =>
      getCaseWorkspaceStepGroups(
        item,
        selectedAttempt,
        selectedDocumentAttemptIndex,
      ),
    [item, selectedAttempt, selectedDocumentAttemptIndex],
  );
  const workspaceSteps = useMemo(
    () => stepGroups.flatMap((group) => group.steps),
    [stepGroups],
  );
  const stepSummary = useMemo(
    () => getWorkspaceStepSummary(workspaceSteps),
    [workspaceSteps],
  );

  const selectedStep =
    workspaceSteps.find((step) => step.id === selectedStepId) ??
    getDefaultCaseWorkspaceStep(
      item,
      selectedAttempt,
      selectedDocumentAttemptIndex,
    );
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
      setInspectorTab('record');
      playbackIndexRef.current += 1;
    };
    advance();
    const interval = window.setInterval(advance, 900);
    return () => window.clearInterval(interval);
  }, [isPlaying, positionedFrames]);

  const selectAttempt = (
    attempt?: TestRunReportAttempt,
    documentAttemptIndex?: number,
  ) => {
    const nextStep = getDefaultCaseWorkspaceStep(
      item,
      attempt,
      documentAttemptIndex,
    );
    setSelectedDocumentAttemptIndex(documentAttemptIndex);
    setSelectedAttemptId(attempt?.attemptId);
    setSelectedStepId(nextStep?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab(nextStep?.agentDetails?.length ? 'record' : 'io');
    setIsPlaying(false);
    clearRunnerStepHash();
  };
  const selectStep = (step: TestRunReportStep) => {
    setSelectedStepId(step.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(getDefaultVisualFrameForStep(step, visualFrames)?.key);
    setInspectorTab(step.agentDetails?.length ? 'record' : 'io');
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
    setInspectorTab(owningStep?.agentDetails?.length ? 'record' : 'io');
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
        selectedDocumentAttemptIndex={selectedDocumentAttemptIndex}
        backLabel={backLabel}
        onBack={onBack}
        onSelectAttempt={selectAttempt}
        onSelectDocumentAttempt={(index) =>
          selectAttempt(
            item.testCase.attempts.find(
              (attempt) => attempt.attemptIndex === index,
            ),
            index,
          )
        }
        stepSummary={stepSummary}
      />

      <LifecycleErrors
        issues={[
          ...(selectedAttempt?.hostErrors ?? []).map(({ phase, error }) => ({
            label: `Attempt ${selectedAttempt!.attemptIndex + 1}: ${phase} failed`,
            error,
          })),
          ...(
            getCaseWorkspaceDocument(
              item,
              selectedAttempt,
              selectedDocumentAttemptIndex,
            ).hostErrors ?? []
          ).map(({ phase, error }) => ({
            label: `Document ${phase} failed`,
            error,
          })),
          ...(selectedAttempt?.teardownErrors ?? []).map((error) => ({
            label: `Attempt ${selectedAttempt!.attemptIndex + 1}: Case teardown failed`,
            error,
          })),
          ...(
            getCaseWorkspaceDocument(
              item,
              selectedAttempt,
              selectedDocumentAttemptIndex,
            ).teardownErrors ?? []
          ).map((error) => ({
            label: 'Document teardown failed',
            error,
          })),
        ]}
      />
      {workspaceSteps.length > 0 ? (
        <>
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
                reports={reports}
                renderAgentReport={renderAgentReport}
                timeline={
                  selectedAttempt ? (
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
                  ) : undefined
                }
                onTabChange={selectInspectorTab}
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
