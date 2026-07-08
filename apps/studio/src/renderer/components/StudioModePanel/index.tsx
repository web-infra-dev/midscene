import type {
  ExternalRunRequest,
  FormValue,
  PlaygroundExecutionStatus,
} from '@midscene/visualizer';
import { App as AntdApp, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import {
  createImportedMarkdownAiActReplayPrompt,
  createRecorderAiActReplayPrompt,
} from '../../recorder/replay';
import {
  createStudioRecorderTargetSignature,
  filterStudioRecorderSessionsForTarget,
} from '../../recorder/selectors';
import type {
  StudioMode,
  StudioRecorderTarget,
  StudioRecordingSession,
} from '../../recorder/types';
import { StudioModeTab } from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import Playground from '../Playground';
import {
  StudioTimelineExecution,
  createStudioTimelineConfig,
  createStudioTimelineStorageNamespace,
} from '../Playground/StudioTimelineExecution';
import { PlaygroundShell } from '../PlaygroundShell';
import {
  RecorderScreenshotDetailView,
  StudioRecorderPanel,
  StudioReplayPanel,
} from '../Recorder';
import {
  type StudioRightPanelView,
  StudioRightPanelViewType,
} from '../StudioRightPanel';
import {
  StudioTimelineEmptyState,
  StudioTimelinePanel,
} from '../StudioTimelinePanel';

type ReportDisplay = {
  type?: string;
  prompt?: string;
};

type StudioExternalRunRequest = ExternalRunRequest & {
  reportDisplay?: ReportDisplay;
  targetSignature: string | null;
};

interface StudioModePanelProps {
  studioMode: StudioMode;
  onStudioModeChange: (mode: StudioMode) => void;
  onHeaderChange?: (header: {
    title: ReactNode;
    actions?: ReactNode;
  }) => void;
  onOpenStudioRightPanel?: (view: StudioRightPanelView) => void;
}

function ImportReplayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[16px] w-[16px]"
      fill="none"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <path d="M12 4v10" stroke="currentColor" strokeLinecap="round" />
      <path
        d="m8 8 4-4 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReplayImportAction({
  disabledReason,
  onImportReplay,
}: {
  disabledReason: string | null;
  onImportReplay: () => void;
}) {
  return (
    <Tooltip
      placement="bottom"
      title={disabledReason || 'Import Markdown or YAML replay'}
    >
      <span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center">
        <button
          aria-label="Import Markdown or YAML replay"
          className="inline-flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-surface-muted p-[6px] text-text-secondary hover:bg-surface-hover-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
          disabled={Boolean(disabledReason)}
          onClick={onImportReplay}
          type="button"
        >
          <ImportReplayIcon />
        </button>
      </span>
    </Tooltip>
  );
}

function createExternalRunRequest(
  value: FormValue,
  displayContent: string,
  targetSignature: string | null,
  reportDisplay?: ReportDisplay,
): StudioExternalRunRequest {
  const request: StudioExternalRunRequest = {
    displayContent,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    targetSignature,
    value,
  };
  if (reportDisplay) {
    request.reportDisplay = reportDisplay;
  }
  return request;
}

function ReplayExecutionPanel({
  actions,
  executionScopeKey,
  externalRunRequest,
  onExecutionStatusChange,
  playground,
  replayTitle,
  showHeader,
  storageNamespace,
}: {
  actions?: ReactNode;
  executionScopeKey: string | null;
  externalRunRequest: StudioExternalRunRequest | null;
  onExecutionStatusChange?: (status: PlaygroundExecutionStatus) => void;
  playground: ReturnType<typeof useStudioPlayground>;
  replayTitle: string;
  showHeader: boolean;
  storageNamespace: string;
}) {
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const canRenderReplayExecution =
    Boolean(externalRunRequest) &&
    playground.phase === 'ready' &&
    playground.controller.state.serverOnline &&
    playground.controller.state.sessionViewState.connected;
  const shouldRenderDisconnectedFallback =
    Boolean(externalRunRequest) &&
    (playground.phase !== 'ready' ||
      !playground.controller.state.serverOnline ||
      !playground.controller.state.sessionViewState.connected);
  const replayConfig = useMemo(
    () =>
      createStudioTimelineConfig({
        emptyState: (
          <StudioTimelineEmptyState
            description="The mission progress will be displayed here."
            title="No execution yet"
            variant={StudioModeTab.Replay}
          />
        ),
        executionScopeKey,
        externalRunRequest,
        hidePromptInput: true,
        onExecutionStatusChange,
        showClearButton: true,
        storageNamespace,
        suppressConfigErrorToast: true,
        timelineWrapper: (content, state) =>
          state.empty ? null : (
            <StudioTimelinePanel
              ariaHidden={timelineCollapsed}
              className="studio-replay-timeline-panel"
              collapsed={timelineCollapsed}
              contentClassName="studio-replay-timeline-panel-body"
              empty={state.empty}
              expanded={!state.empty}
              headerAction={timelineCollapsed ? null : state.headerAction}
              onToggleCollapsed={() => {
                setTimelineCollapsed((collapsed) => !collapsed);
              }}
              scrollBody={!state.empty}
              variant={StudioModeTab.Replay}
            >
              {content}
            </StudioTimelinePanel>
          ),
      }),
    [
      externalRunRequest,
      executionScopeKey,
      onExecutionStatusChange,
      storageNamespace,
      timelineCollapsed,
    ],
  );

  let timelinePanel: ReactNode = null;
  if (externalRunRequest && shouldRenderDisconnectedFallback) {
    timelinePanel = (
      <StudioTimelinePanel
        ariaHidden={timelineCollapsed}
        className="studio-replay-timeline-panel"
        collapsed={timelineCollapsed}
        contentClassName="studio-replay-timeline-panel-body"
        empty={shouldRenderDisconnectedFallback}
        expanded={!shouldRenderDisconnectedFallback}
        onToggleCollapsed={() => {
          setTimelineCollapsed((collapsed) => !collapsed);
        }}
        scrollBody={!shouldRenderDisconnectedFallback}
        variant={StudioModeTab.Replay}
      >
        <StudioTimelineEmptyState
          description="The mission progress will be displayed here."
          title="No execution yet"
          variant={StudioModeTab.Replay}
        />
      </StudioTimelinePanel>
    );
  } else if (externalRunRequest && canRenderReplayExecution) {
    timelinePanel = (
      <StudioTimelineExecution
        className="studio-replay-execution-panel"
        controller={playground.controller}
        playgroundClassName={[
          'studio-replay-execution',
          'studio-playground-timeline-content-only',
          timelineCollapsed ? 'studio-playground-timeline-collapsed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        playgroundConfig={replayConfig}
        title="Replay"
      />
    );
  }

  if (showHeader) {
    return (
      <PlaygroundShell
        actions={actions}
        showHeader={showHeader}
        title={replayTitle}
      >
        {timelinePanel}
      </PlaygroundShell>
    );
  }

  return timelinePanel;
}

export default function StudioModePanel({
  onHeaderChange,
  onOpenStudioRightPanel,
  onStudioModeChange,
  studioMode,
}: StudioModePanelProps) {
  const { message } = AntdApp.useApp();
  const playground = useStudioPlayground();
  const recorder = useStudioRecorder();
  const stopRecording = recorder.stopRecording;
  const [externalRunRequest, setExternalRunRequest] =
    useState<StudioExternalRunRequest | null>(null);
  const [playgroundExternalRunRequest, setPlaygroundExternalRunRequest] =
    useState<StudioExternalRunRequest | null>(null);
  const [replayingSessionId, setReplayingSessionId] = useState<string | null>(
    null,
  );
  const [replayExecutionStatus, setReplayExecutionStatus] =
    useState<PlaygroundExecutionStatus>({
      running: false,
      stoppable: false,
      stop: () => undefined,
    });
  const replayExecutionWasRunningRef = useRef(false);
  const lastKnownTargetRef = useRef<StudioRecorderTarget | null>(null);
  if (recorder.currentTarget) {
    lastKnownTargetRef.current = recorder.currentTarget;
  }
  const sharedDeviceTarget =
    recorder.currentTarget ?? lastKnownTargetRef.current;
  const currentTargetSignature = useMemo(
    () => createStudioRecorderTargetSignature(sharedDeviceTarget),
    [sharedDeviceTarget],
  );
  const triggerExternalRun = useCallback(
    (
      value: FormValue,
      displayContent: string,
      reportDisplay?: ReportDisplay,
    ) => {
      setExternalRunRequest(
        createExternalRunRequest(
          value,
          displayContent,
          currentTargetSignature,
          reportDisplay,
        ),
      );
    },
    [currentTargetSignature],
  );
  const activeExternalRunRequest = useMemo(
    () =>
      currentTargetSignature &&
      externalRunRequest?.targetSignature === currentTargetSignature
        ? externalRunRequest
        : null,
    [currentTargetSignature, externalRunRequest],
  );
  const activePlaygroundExternalRunRequest = useMemo(
    () =>
      currentTargetSignature &&
      playgroundExternalRunRequest?.targetSignature === currentTargetSignature
        ? playgroundExternalRunRequest
        : null,
    [currentTargetSignature, playgroundExternalRunRequest],
  );
  const playgroundStorageNamespace = useMemo(
    () => createStudioTimelineStorageNamespace(currentTargetSignature),
    [currentTargetSignature],
  );
  const replaySessions = useMemo(
    () =>
      filterStudioRecorderSessionsForTarget(
        recorder.state.sessions ?? [],
        sharedDeviceTarget,
      ),
    [sharedDeviceTarget, recorder.state.sessions],
  );
  const importReplayDisabledReason =
    playground.phase !== 'ready' ||
    !playground.controller.state.serverOnline ||
    !playground.controller.state.sessionViewState.connected
      ? 'Connect a target before replaying a file.'
      : null;
  const handleImportReplay = useCallback(async () => {
    try {
      if (importReplayDisabledReason) {
        message.info(importReplayDisabledReason);
        return;
      }
      if (!window.studioRuntime?.chooseReplayFile) {
        message.error('Studio replay file picker is unavailable.');
        return;
      }
      const replayFile = await window.studioRuntime.chooseReplayFile();
      if (!replayFile) {
        return;
      }
      onStudioModeChange(StudioModeTab.Replay);
      if (replayFile.type === 'markdown') {
        triggerExternalRun(
          {
            prompt: createImportedMarkdownAiActReplayPrompt({
              displayName: replayFile.displayName,
              markdown: replayFile.content,
            }),
            type: 'aiAct',
          },
          `Imported Markdown Replay: ${replayFile.displayName}`,
          { prompt: `Imported Markdown Replay: ${replayFile.displayName}` },
        );
        return;
      }
      triggerExternalRun(
        { prompt: replayFile.content, type: 'runYaml' },
        `Imported YAML Replay: ${replayFile.displayName}`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [
    importReplayDisabledReason,
    message,
    onStudioModeChange,
    triggerExternalRun,
  ]);
  const handleImportPlaygroundReplay = useCallback(async () => {
    try {
      if (importReplayDisabledReason) {
        message.info(importReplayDisabledReason);
        return;
      }
      if (!window.studioRuntime?.chooseReplayFile) {
        message.error('Studio replay file picker is unavailable.');
        return;
      }
      const replayFile = await window.studioRuntime.chooseReplayFile();
      if (!replayFile) {
        return;
      }
      if (replayFile.type === 'markdown') {
        setPlaygroundExternalRunRequest(
          createExternalRunRequest(
            {
              prompt: createImportedMarkdownAiActReplayPrompt({
                displayName: replayFile.displayName,
                markdown: replayFile.content,
              }),
              type: 'aiAct',
            },
            `Imported Markdown Replay: ${replayFile.displayName}`,
            currentTargetSignature,
            { prompt: `Imported Markdown Replay: ${replayFile.displayName}` },
          ),
        );
        return;
      }
      setPlaygroundExternalRunRequest(
        createExternalRunRequest(
          { prompt: replayFile.content, type: 'runYaml' },
          `Imported YAML Replay: ${replayFile.displayName}`,
          currentTargetSignature,
        ),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [currentTargetSignature, importReplayDisabledReason, message]);
  const handleReplaySession = useCallback(
    async (session: StudioRecordingSession) => {
      try {
        if (importReplayDisabledReason) {
          message.info(importReplayDisabledReason);
          return;
        }
        setReplayingSessionId(session.id);
        replayExecutionWasRunningRef.current = false;
        let replaySession = session;
        if (!replaySession.generatedCode?.markdown) {
          const markdown = await recorder.generateSessionCode(session.id, {
            type: 'markdown',
          });
          replaySession = {
            ...session,
            generatedCode: {
              ...session.generatedCode,
              markdown,
            },
          };
        }
        triggerExternalRun(
          {
            prompt: createRecorderAiActReplayPrompt(replaySession),
            type: 'aiAct',
          },
          `Replay: ${session.name}`,
          { prompt: session.name },
        );
      } catch (error) {
        setReplayingSessionId(null);
        replayExecutionWasRunningRef.current = false;
        message.error(error instanceof Error ? error.message : String(error));
      }
    },
    [importReplayDisabledReason, message, recorder, triggerExternalRun],
  );
  const handleReplayExecutionStatusChange = useCallback(
    (status: PlaygroundExecutionStatus) => {
      setReplayExecutionStatus(status);
      if (status.running) {
        replayExecutionWasRunningRef.current = true;
        return;
      }
      if (replayExecutionWasRunningRef.current) {
        replayExecutionWasRunningRef.current = false;
        setReplayingSessionId(null);
      }
    },
    [],
  );
  const handleDownloadReplaySession = useCallback(
    async (session: StudioRecordingSession) => {
      try {
        if (!session.generatedCode?.markdown) {
          await recorder.generateSessionCode(session.id, {
            type: 'markdown',
          });
        }
        await recorder.exportSessionCode(session.id, 'markdown');
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    },
    [message, recorder],
  );
  const handleDeleteReplaySession = useCallback(
    async (session: StudioRecordingSession) => {
      try {
        await recorder.deleteSession(session.id);
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    },
    [message, recorder],
  );
  const replayTitle =
    activeExternalRunRequest?.reportDisplay?.prompt ||
    activeExternalRunRequest?.displayContent ||
    'Replay';
  const playgroundInputActions = useMemo(
    () => (
      <ReplayImportAction
        disabledReason={importReplayDisabledReason}
        onImportReplay={handleImportPlaygroundReplay}
      />
    ),
    [handleImportPlaygroundReplay, importReplayDisabledReason],
  );
  const renderOwnHeader = !onHeaderChange;

  useEffect(() => {
    setExternalRunRequest(null);
    setPlaygroundExternalRunRequest(null);
    setReplayingSessionId(null);
    replayExecutionWasRunningRef.current = false;
    setReplayExecutionStatus({
      running: false,
      stoppable: false,
      stop: () => undefined,
    });
  }, [currentTargetSignature]);

  useEffect(() => {
    if (studioMode !== StudioModeTab.Record) {
      void stopRecording();
    }
  }, [studioMode, stopRecording]);

  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, [stopRecording]);

  useEffect(() => {
    if (!onHeaderChange) {
      return;
    }

    if (studioMode === StudioModeTab.Record) {
      onHeaderChange({ title: 'Record' });
      return;
    }

    if (studioMode === StudioModeTab.Replay) {
      onHeaderChange({
        title: replayTitle,
      });
    }
  }, [onHeaderChange, replayTitle, studioMode]);

  const recordActive = studioMode === StudioModeTab.Record;
  const replayActive = studioMode === StudioModeTab.Replay;
  const playgroundActive = studioMode === StudioModeTab.Playground;
  const modePaneClassName = (active: boolean) =>
    ['studio-mode-panel-pane', active ? 'studio-mode-panel-pane-active' : '']
      .filter(Boolean)
      .join(' ');

  return (
    <div className="studio-mode-panel-stack">
      <div
        aria-hidden={!recordActive}
        className={`${modePaneClassName(recordActive)} studio-recorder-column min-h-0 h-full flex-1 overflow-hidden bg-transparent`}
      >
        <StudioRecorderPanel
          onShowMarkdown={({ markdown, onDelete, onDownload, title }) => {
            onOpenStudioRightPanel?.({
              markdown,
              onDelete,
              onDownload,
              title,
              type: StudioRightPanelViewType.Markdown,
            });
          }}
          onShowScreenshots={(events) => {
            onOpenStudioRightPanel?.({
              content: <RecorderScreenshotDetailView events={events} />,
              type: StudioRightPanelViewType.Screenshots,
            });
          }}
        />
      </div>
      <div
        aria-hidden={!replayActive}
        className={`${modePaneClassName(replayActive)} studio-replay-column flex h-full min-h-0 flex-col gap-[8px] overflow-x-hidden overflow-y-auto bg-transparent pb-px`}
      >
        <StudioReplayPanel
          activeSessionId={replayingSessionId}
          activeSessionStoppable={replayExecutionStatus.stoppable}
          onDeleteSession={(session) => {
            void handleDeleteReplaySession(session);
          }}
          onDownloadSession={(session) => {
            void handleDownloadReplaySession(session);
          }}
          onReplaySession={(session) => {
            void handleReplaySession(session);
          }}
          onStopActiveSession={() => {
            void replayExecutionStatus.stop();
          }}
          sessions={replaySessions}
        />
        <ReplayExecutionPanel
          executionScopeKey={currentTargetSignature}
          externalRunRequest={activeExternalRunRequest}
          onExecutionStatusChange={handleReplayExecutionStatusChange}
          playground={playground}
          replayTitle={replayTitle}
          showHeader={renderOwnHeader}
          storageNamespace={`${playgroundStorageNamespace}-replay`}
        />
      </div>
      <div
        aria-hidden={!playgroundActive}
        className={`${modePaneClassName(playgroundActive)} studio-playground-column h-full min-h-0 flex-1`}
      >
        <Playground
          externalRunRequest={activePlaygroundExternalRunRequest}
          inputActions={playgroundInputActions}
          onHeaderChange={playgroundActive ? onHeaderChange : undefined}
          playground={playground}
        />
      </div>
    </div>
  );
}
