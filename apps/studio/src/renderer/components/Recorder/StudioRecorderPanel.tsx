import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { App as AntdApp } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  filterStudioRecorderSessionsForTarget,
  isStudioRecorderSessionForTarget,
} from '../../recorder/selectors';
import type { StudioRecordingSession } from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import { RecorderDetailView } from './RecorderDetailView';
import { RecorderFloatingPanel } from './RecorderFloatingPanel';
import { RecorderHistoryList } from './RecorderHistoryList';
import {
  CODE_TYPE_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  type StudioRecorderGenerationState,
  type StudioRecorderTab,
  codeTypeLabel,
  createInitialGenerationSteps,
  getAvailableCodeType,
  getMarkdownOutputLabel,
  isPlaywrightAvailable,
  mergeGenerationProgress,
  platformLabel,
  readPersistedCodeType,
  readPersistedLanguage,
} from './recorder-panel-utils';
import './studio-recorder-panel.css';

interface StudioRecorderPanelProps {
  onReplayMarkdown?: (session: StudioRecordingSession) => Promise<void>;
}

export function StudioRecorderPanel({
  onReplayMarkdown,
}: StudioRecorderPanelProps = {}) {
  const { message } = AntdApp.useApp();
  const recorder = useStudioRecorder();
  const {
    state,
    currentSession,
    currentTarget,
    canStartRecording,
    startRecording,
    stopRecording,
    deleteSession,
    renameSession,
    selectSession,
    generateSessionCode,
    exportSessionCode,
  } = recorder;
  const sessions = state.sessions;
  const visibleSessions = useMemo(
    () => filterStudioRecorderSessionsForTarget(sessions, currentTarget),
    [currentTarget, sessions],
  );
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudioRecorderTab>('timeline');
  const [selectedCodeType, setSelectedCodeType] =
    useState<StudioRecorderCodeType>(readPersistedCodeType);
  const [selectedLanguage, setSelectedLanguage] = useState(
    readPersistedLanguage,
  );
  const [showExpandedDetail, setShowExpandedDetail] = useState(false);
  const [showCollapsed, setShowCollapsed] = useState(false);
  const [showAllTimelineEvents, setShowAllTimelineEvents] = useState(false);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);
  const [generation, setGeneration] = useState<StudioRecorderGenerationState>({
    sessionId: null,
    type: 'markdown',
    status: 'idle',
    content: '',
    error: null,
    steps: createInitialGenerationSteps(),
  });
  const runPanelAction = useCallback(
    async <T,>(action: () => Promise<T>) => {
      try {
        return await action();
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : 'Recorder failed.',
        );
        return undefined;
      }
    },
    [message],
  );

  const detailSession = useMemo(() => {
    const selectedSession =
      visibleSessions.find((session) => session.id === detailSessionId) ?? null;
    if (selectedSession) {
      return selectedSession;
    }
    return state.isRecording &&
      currentSession &&
      isStudioRecorderSessionForTarget(currentSession, currentTarget)
      ? currentSession
      : null;
  }, [
    currentSession,
    currentTarget,
    detailSessionId,
    state.isRecording,
    visibleSessions,
  ]);
  const activeCodeType = getAvailableCodeType(detailSession, selectedCodeType);
  const activeGeneratedCode =
    detailSession?.generatedCode?.[activeCodeType] || '';
  const activeCode =
    generation.sessionId === detailSession?.id &&
    generation.type === activeCodeType
      ? generation.content || activeGeneratedCode
      : activeGeneratedCode;
  const codeLabel = codeTypeLabel(activeCodeType);
  const isGenerating =
    generation.status === 'generating' &&
    generation.sessionId === detailSession?.id &&
    generation.type === activeCodeType;
  const statusText = useMemo(() => {
    if (state.initializing) {
      return 'Loading recorder...';
    }
    if (state.isRecording) {
      return 'Recording';
    }
    if (!canStartRecording) {
      return 'Connect a device to start recording.';
    }
    return currentTarget
      ? `Ready for ${platformLabel(currentTarget.platformId)}`
      : 'Ready';
  }, [canStartRecording, currentTarget, state.initializing, state.isRecording]);

  useEffect(() => {
    if (state.isRecording && currentSession?.id) {
      setDetailSessionId(currentSession.id);
      setActiveTab('timeline');
    }
  }, [currentSession?.id, state.isRecording]);

  useEffect(() => {
    if (!state.isRecording) {
      setIsStoppingRecording(false);
    }
  }, [state.isRecording]);

  useEffect(() => {
    if (
      detailSessionId &&
      !visibleSessions.some((session) => session.id === detailSessionId)
    ) {
      setDetailSessionId(null);
      setActiveTab('timeline');
    }
  }, [detailSessionId, visibleSessions]);

  useEffect(() => {
    if (
      selectedCodeType === 'playwright' &&
      !isPlaywrightAvailable(detailSession)
    ) {
      setSelectedCodeType('markdown');
    }
  }, [detailSession, selectedCodeType]);

  const runCodeGeneration = useCallback(
    async (
      sessionId: string,
      preferredType: StudioRecorderCodeType = selectedCodeType,
      force = false,
    ) => {
      const session =
        sessions.find((item) => item.id === sessionId) ??
        (currentSession?.id === sessionId ? currentSession : null);
      const type = getAvailableCodeType(session, preferredType);
      setActiveTab('code');
      setSelectedCodeType(type);
      setGeneration({
        sessionId,
        type,
        status: 'generating',
        content: session?.generatedCode?.[type] || '',
        error: null,
        steps: createInitialGenerationSteps(),
      });

      try {
        const code = await generateSessionCode(sessionId, {
          type,
          force,
          language:
            type !== 'playwright' && selectedLanguage !== 'auto'
              ? selectedLanguage
              : undefined,
          onChunk: (content) => {
            setGeneration((current) => {
              if (current.sessionId !== sessionId || current.type !== type) {
                return current;
              }
              return {
                ...current,
                status: 'generating',
                content,
                error: null,
              };
            });
          },
          onProgress: (progress) => {
            setGeneration((current) => {
              if (current.sessionId !== sessionId || current.type !== type) {
                return current;
              }
              return {
                ...current,
                status: 'generating',
                steps: mergeGenerationProgress(current.steps, progress),
              };
            });
          },
        });
        setGeneration((current) => {
          const steps =
            current.sessionId === sessionId && current.type === type
              ? current.steps
              : createInitialGenerationSteps();
          return {
            sessionId,
            type,
            status: 'success',
            content: code,
            error: null,
            steps: mergeGenerationProgress(steps, {
              step: 'code',
              status: 'completed',
            }),
          };
        });
        message.success(`AI ${codeTypeLabel(type)} generated successfully!`);
        return code;
      } catch (error) {
        setGeneration((current) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : `Failed to generate ${type}.`;
          const steps =
            current.sessionId === sessionId && current.type === type
              ? mergeGenerationProgress(current.steps, {
                  step: 'code',
                  status: 'error',
                  details: errorMessage,
                })
              : createInitialGenerationSteps();
          return {
            sessionId,
            type,
            status: 'error',
            content: '',
            error: errorMessage,
            steps,
          };
        });
        throw error;
      }
    },
    [
      currentSession,
      generateSessionCode,
      message,
      selectedCodeType,
      selectedLanguage,
      sessions,
    ],
  );

  const openDetail = useCallback(
    (sessionId: string, tab: StudioRecorderTab = 'timeline') => {
      selectSession(sessionId);
      setDetailSessionId(sessionId);
      setActiveTab(tab);
      setShowExpandedDetail(false);
      setShowCollapsed(false);
    },
    [selectSession],
  );

  const handleCodeTabClick = useCallback(() => {
    if (!detailSession) {
      return;
    }
    setActiveTab('code');
    if (
      detailSession.events.length > 0 &&
      !state.isRecording &&
      !detailSession.generatedCode?.[activeCodeType] &&
      generation.status !== 'generating'
    ) {
      void runPanelAction(() => runCodeGeneration(detailSession.id));
    }
  }, [
    activeCodeType,
    detailSession,
    generation.status,
    runCodeGeneration,
    runPanelAction,
    state.isRecording,
  ]);

  const handleCopyCode = useCallback(async () => {
    if (!activeCode) {
      return;
    }
    await navigator.clipboard.writeText(activeCode);
    message.success(`${codeLabel} copied to clipboard`);
  }, [activeCode, codeLabel, message]);

  const handleCodeTypeChange = useCallback(
    (nextType: StudioRecorderCodeType) => {
      if (!detailSession) {
        return;
      }
      setSelectedCodeType(nextType);
      window.localStorage.setItem(CODE_TYPE_STORAGE_KEY, nextType);
      if (
        detailSession.events.length > 0 &&
        !detailSession.generatedCode?.[nextType]
      ) {
        void runPanelAction(() =>
          runCodeGeneration(detailSession.id, nextType),
        );
      }
    },
    [detailSession, runCodeGeneration, runPanelAction],
  );

  const handleLanguageChange = useCallback((nextLanguage: string) => {
    setSelectedLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }, []);

  const recorderPanelSession = detailSession;
  const recorderPanelEvents = recorderPanelSession?.events ?? [];
  const isMarkdownGenerating =
    generation.status === 'generating' &&
    generation.sessionId === recorderPanelSession?.id &&
    generation.type === 'markdown';
  const generatedMarkdown =
    recorderPanelSession?.generatedCode?.markdown ||
    (generation.sessionId === recorderPanelSession?.id &&
    generation.type === 'markdown'
      ? generation.content
      : '');
  const markdownOutputLabel = getMarkdownOutputLabel(
    generatedMarkdown,
    recorderPanelSession,
  );

  const handleRecorderToggle = useCallback(() => {
    if (state.isRecording) {
      if (isStoppingRecording) {
        return;
      }
      setIsStoppingRecording(true);
      void runPanelAction(async () => {
        const sessionId = currentSession?.id;
        const generationType = getAvailableCodeType(
          currentSession,
          selectedCodeType,
        );
        if (sessionId && generationType === 'markdown') {
          setGeneration({
            sessionId,
            type: 'markdown',
            status: 'generating',
            content: currentSession?.generatedCode?.markdown || '',
            error: null,
            steps: createInitialGenerationSteps(),
          });
        }
        try {
          await stopRecording();
        } finally {
          setIsStoppingRecording(false);
        }
        if (sessionId) {
          await runCodeGeneration(sessionId, generationType, true);
        }
      });
      return;
    }

    void runPanelAction(async () => {
      const session = await startRecording();
      if (session) {
        setShowCollapsed(false);
        setShowAllTimelineEvents(false);
        openDetail(session.id);
      }
    });
  }, [
    currentSession?.id,
    currentSession,
    isStoppingRecording,
    openDetail,
    runPanelAction,
    runCodeGeneration,
    selectedCodeType,
    startRecording,
    state.isRecording,
    stopRecording,
  ]);

  const historyControl = (
    <RecorderHistoryList
      currentSessionId={currentSession?.id}
      isRecording={state.isRecording}
      onDeleteSession={(sessionId) => {
        void runPanelAction(async () => {
          await deleteSession(sessionId);
          if (detailSessionId === sessionId) {
            setDetailSessionId(null);
          }
        });
      }}
      onExportMarkdown={(sessionId) => {
        void runPanelAction(() => exportSessionCode(sessionId, 'markdown'));
      }}
      onOpenDetail={openDetail}
      onRenameSession={(sessionId, name) =>
        runPanelAction(() => renameSession(sessionId, name)).then(
          () => undefined,
        )
      }
      sessions={visibleSessions}
      trigger={
        <button
          aria-label="Recording history"
          className="studio-recorder-floating-tool-button"
          title="Recording history"
          type="button"
        >
          <span className="studio-recorder-floating-history-icon" />
        </button>
      }
    />
  );

  const detailView = (
    <RecorderDetailView
      activeCode={activeCode}
      activeCodeType={activeCodeType}
      activeTab={activeTab}
      codeLabel={codeLabel}
      detailSession={detailSession}
      fallback={
        <div className="studio-recorder-empty">
          Select a recording from history.
        </div>
      }
      generation={generation}
      isGenerating={isGenerating}
      onBackToList={() => {
        setDetailSessionId(null);
        setActiveTab('timeline');
      }}
      onCodeTabClick={handleCodeTabClick}
      onCodeTypeChange={handleCodeTypeChange}
      onCopyCode={() => {
        void runPanelAction(handleCopyCode);
      }}
      onExportCode={() => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() =>
          exportSessionCode(detailSession.id, activeCodeType),
        );
      }}
      onLanguageChange={handleLanguageChange}
      onRegenerateCode={() => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() =>
          runCodeGeneration(detailSession.id, activeCodeType, true),
        );
      }}
      onTabChange={setActiveTab}
      selectedLanguage={selectedLanguage}
    />
  );

  return (
    <RecorderFloatingPanel
      canStartRecording={canStartRecording}
      detailView={detailView}
      error={state.error}
      generatedMarkdown={generatedMarkdown}
      historyControl={historyControl}
      isMarkdownGenerating={isMarkdownGenerating}
      isRecording={state.isRecording}
      isStoppingRecording={isStoppingRecording}
      markdownOutputLabel={markdownOutputLabel}
      onExportMarkdown={() => {
        if (!recorderPanelSession) {
          return;
        }
        void runPanelAction(() =>
          exportSessionCode(recorderPanelSession.id, 'markdown'),
        );
      }}
      onReplayMarkdown={
        onReplayMarkdown && recorderPanelSession
          ? () => {
              void runPanelAction(() => onReplayMarkdown(recorderPanelSession));
            }
          : undefined
      }
      onToggleAllTimelineEvents={() => {
        setShowAllTimelineEvents((current) => !current);
      }}
      onToggleCollapsed={() => {
        setShowExpandedDetail(false);
        setShowCollapsed((current) => {
          if (!current) {
            setShowAllTimelineEvents(false);
          }
          return !current;
        });
      }}
      onToggleRecording={handleRecorderToggle}
      recorderPanelEvents={recorderPanelEvents}
      recorderPanelSession={recorderPanelSession}
      showAllTimelineEvents={showAllTimelineEvents}
      showCollapsed={showCollapsed}
      showExpandedDetail={showExpandedDetail}
      statusText={statusText}
    />
  );
}
