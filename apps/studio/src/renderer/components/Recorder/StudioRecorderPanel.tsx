import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { App as AntdApp } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  filterStudioRecorderSessionsForTarget,
  isStudioRecorderSessionForTarget,
} from '../../recorder/selectors';
import type { StudioRecordedEvent } from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import { RecorderDetailView } from './RecorderDetailView';
import { RecorderFloatingPanel } from './RecorderFloatingPanel';
import {
  CODE_TYPE_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  type StudioRecorderGenerationState,
  type StudioRecorderTab,
  codeTypeLabel,
  createInitialGenerationSteps,
  getAvailableCodeType,
  isPlaywrightAvailable,
  mergeGenerationProgress,
  platformLabel,
  readPersistedCodeType,
  readPersistedLanguage,
} from './recorder-panel-utils';
import './studio-recorder-panel.css';

interface StudioRecorderPanelProps {
  onShowMarkdown?: (options: {
    markdown: string;
    onDelete?: () => void | Promise<void>;
    onDownload?: () => void | Promise<void>;
    title?: string;
  }) => void;
  onShowScreenshots?: (events: StudioRecordedEvent[]) => void;
}

export function StudioRecorderPanel({
  onShowMarkdown,
  onShowScreenshots,
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
    deleteSessionCode,
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
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
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
      showCodeTab = true,
    ) => {
      const session =
        sessions.find((item) => item.id === sessionId) ??
        (currentSession?.id === sessionId ? currentSession : null);
      const type = getAvailableCodeType(session, preferredType);
      if (showCodeTab) {
        setActiveTab('code');
      }
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
      setTimelineCollapsed(false);
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
  const canGenerateMarkdown =
    Boolean(recorderPanelSession) &&
    recorderPanelEvents.length > 0 &&
    !state.isRecording &&
    !isMarkdownGenerating;

  const handleRecorderToggle = useCallback(() => {
    if (state.isRecording) {
      if (isStoppingRecording) {
        return;
      }
      setIsStoppingRecording(true);
      void runPanelAction(async () => {
        const sessionId = currentSession?.id;
        try {
          await stopRecording();
        } finally {
          setIsStoppingRecording(false);
        }
        if (sessionId) {
          setDetailSessionId(sessionId);
          setActiveTab('timeline');
          setTimelineCollapsed(false);
        }
      });
      return;
    }

    void runPanelAction(async () => {
      const session = await startRecording();
      if (session) {
        setTimelineCollapsed(false);
        openDetail(session.id);
      }
    });
  }, [
    currentSession?.id,
    isStoppingRecording,
    openDetail,
    runPanelAction,
    startRecording,
    state.isRecording,
    stopRecording,
  ]);

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
      canGenerateMarkdown={canGenerateMarkdown}
      detailView={detailView}
      error={state.error}
      isMarkdownGenerating={isMarkdownGenerating}
      isRecording={state.isRecording}
      isStoppingRecording={isStoppingRecording}
      onGenerateMarkdown={() => {
        if (!recorderPanelSession) {
          return;
        }
        const sessionId = recorderPanelSession.id;
        const sessionName = recorderPanelSession.name;
        void runPanelAction(async () => {
          const markdown = await runCodeGeneration(
            sessionId,
            'markdown',
            true,
            false,
          );
          if (markdown) {
            onShowMarkdown?.({
              markdown,
              onDelete: () => deleteSessionCode(sessionId, 'markdown'),
              onDownload: () => exportSessionCode(sessionId, 'markdown'),
              title: sessionName,
            });
          }
        });
      }}
      onShowScreenshots={() => {
        if (!recorderPanelSession) {
          return;
        }
        onShowScreenshots?.(recorderPanelSession.events);
      }}
      onToggleCollapsed={() => {
        setTimelineCollapsed((current) => !current);
      }}
      onToggleRecording={handleRecorderToggle}
      recorderPanelEvents={recorderPanelEvents}
      recorderPanelSession={recorderPanelSession}
      showExpandedDetail={false}
      timelineCollapsed={timelineCollapsed}
      statusText={statusText}
    />
  );
}
