import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearRunnerStepHash,
  updateRunnerStepHash,
} from '../../utils/test-run-report';
import {
  getCaseWorkspaceDocumentAttemptIndex,
  getCaseWorkspaceStepGroups,
  getDefaultCaseWorkspaceStep,
} from './case-workspace-model';
import type { RunnerInspectorTab } from './evidence-tabs';
import {
  type RunnerCaseView,
  type RunnerPositionedVisualFrame,
  type RunnerVisualIndex,
  getDefaultVisualFrameForStep,
  getStepForVisualFrame,
  getVisualFrames,
  positionAttemptVisualFrames,
} from './model';

interface WorkspaceSelection {
  documentAttemptIndex?: number;
  attempt?: TestRunReportAttempt;
  step?: TestRunReportStep;
}

const resolveWorkspaceSelection = (
  item: RunnerCaseView,
  stepId?: string,
): WorkspaceSelection => {
  const documentAttemptIndex = getCaseWorkspaceDocumentAttemptIndex(
    item,
    stepId,
  );
  const attempt =
    documentAttemptIndex !== undefined
      ? item.testCase.attempts.find(
          (candidate) => candidate.attemptIndex === documentAttemptIndex,
        )
      : (item.testCase.attempts.find((candidate) =>
          getCaseWorkspaceStepGroups(item, candidate).some((group) =>
            group.steps.some((step) => step.id === stepId),
          ),
        ) ?? item.finalAttempt);
  const steps = getCaseWorkspaceStepGroups(
    item,
    attempt,
    documentAttemptIndex,
  ).flatMap((group) => group.steps);

  return {
    documentAttemptIndex,
    attempt,
    step:
      steps.find((step) => step.id === stepId) ??
      getDefaultCaseWorkspaceStep(item, attempt, documentAttemptIndex),
  };
};

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

export function useCaseWorkspace({
  item,
  initialStepId,
  visualIndex,
}: {
  item: RunnerCaseView;
  initialStepId?: string;
  visualIndex: RunnerVisualIndex;
}) {
  const initialSelectionRef = useRef<WorkspaceSelection | null>(null);
  if (!initialSelectionRef.current) {
    initialSelectionRef.current = resolveWorkspaceSelection(
      item,
      initialStepId,
    );
  }
  const initialSelection = initialSelectionRef.current;
  const [selectedDocumentAttemptIndex, setSelectedDocumentAttemptIndex] =
    useState(initialSelection.documentAttemptIndex);
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    initialSelection.attempt?.attemptId,
  );
  const [selectedStepId, setSelectedStepId] = useState(
    initialSelection.step?.id,
  );
  const [previewFrameKey, setPreviewFrameKey] = useState<string>();
  const [lockedFrameKey, setLockedFrameKey] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<RunnerInspectorTab>(
    initialSelection.step?.agentDetails?.length ? 'record' : 'io',
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);

  const resetSelection = (selection: WorkspaceSelection) => {
    setSelectedDocumentAttemptIndex(selection.documentAttemptIndex);
    setSelectedAttemptId(selection.attempt?.attemptId);
    setSelectedStepId(selection.step?.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(undefined);
    setInspectorTab(selection.step?.agentDetails?.length ? 'record' : 'io');
    setIsPlaying(false);
  };

  useEffect(() => {
    resetSelection(resolveWorkspaceSelection(item, initialStepId));
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
    (positioned) => positioned.frame.key === activeFrame?.key,
  );
  const playingStepId = isPlaying
    ? positionedFrames.find(
        (positioned) => positioned.frame.key === lockedFrameKey,
      )?.stepId
    : undefined;

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
    resetSelection({
      documentAttemptIndex,
      attempt,
      step: getDefaultCaseWorkspaceStep(item, attempt, documentAttemptIndex),
    });
    clearRunnerStepHash();
  };
  const selectDocumentAttempt = (attemptIndex: number) => {
    selectAttempt(
      item.testCase.attempts.find(
        (attempt) => attempt.attemptIndex === attemptIndex,
      ),
      attemptIndex,
    );
  };
  const selectStep = (step: TestRunReportStep) => {
    setSelectedStepId(step.id);
    setPreviewFrameKey(undefined);
    setLockedFrameKey(getDefaultVisualFrameForStep(step, visualFrames)?.key);
    setInspectorTab(step.agentDetails?.length ? 'record' : 'io');
    setIsPlaying(false);
    updateRunnerStepHash(step.id);
  };
  const selectFrame = (positioned: RunnerPositionedVisualFrame) => {
    setPreviewFrameKey(undefined);
    setLockedFrameKey(positioned.frame.key);
    const owningStep = getStepForVisualFrame(workspaceSteps, positioned.frame);
    if (owningStep) {
      setSelectedStepId(owningStep.id);
      updateRunnerStepHash(owningStep.id);
    }
    setInspectorTab(owningStep?.agentDetails?.length ? 'record' : 'io');
    setIsPlaying(false);
  };
  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const lockedIndex = positionedFrames.findIndex(
      (positioned) => positioned.frame.key === lockedFrameKey,
    );
    playbackIndexRef.current =
      lockedIndex < 0 || lockedIndex >= positionedFrames.length - 1
        ? 0
        : lockedIndex + 1;
    if (playbackIndexRef.current === 0) setLockedFrameKey(undefined);
    setIsPlaying(true);
  };

  return {
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
    selectInspectorTab: setInspectorTab,
    selectStep,
    setPreviewFrameKey,
    stepGroups,
    stepSummary,
    togglePlayback,
    workspaceSteps,
  };
}
