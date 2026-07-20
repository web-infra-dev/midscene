import type { StudioRecorderCodeType } from '@shared/electron-contract';
import type {
  ModelEgressDescriptor,
  SessionEvidenceBundle,
  UIKnowledgeEgressDecision,
} from '@shared/ui-knowledge-contract';
import { calculateUIKnowledgeInputStats } from '@shared/ui-knowledge-contract';
import { App as AntdApp, Checkbox } from 'antd';
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
  type StudioRecorderKnowledgeGenerationState,
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

function toggleExcludedId(ids: string[], id: string, include: boolean) {
  return include
    ? ids.filter((candidate) => candidate !== id)
    : Array.from(new Set([...ids, id]));
}

function KnowledgeEgressReview({
  bundle,
  descriptor,
  onDecisionChange,
}: {
  bundle: SessionEvidenceBundle;
  descriptor: ModelEgressDescriptor;
  onDecisionChange: (decision: UIKnowledgeEgressDecision) => void;
}) {
  const [excludedAssetIds, setExcludedAssetIds] = useState<string[]>([]);
  const [excludedEventHashIds, setExcludedEventHashIds] = useState<string[]>(
    [],
  );
  const selection = useMemo(() => {
    const excludedAssets = new Set(excludedAssetIds);
    const excludedEvents = new Set(excludedEventHashIds);
    const events = bundle.events
      .filter((event) => !excludedEvents.has(event.eventHashId))
      .map((event) => ({
        ...event,
        evidenceRefs: event.evidenceRefs.filter(
          (ref) => !excludedAssets.has(ref.assetId),
        ),
      }));
    const referencedAssetIds = new Set(
      events.flatMap((event) => event.evidenceRefs.map((ref) => ref.assetId)),
    );
    const assets = bundle.assets.filter(
      (asset) =>
        !excludedAssets.has(asset.assetId) &&
        referencedAssetIds.has(asset.assetId),
    );
    const invalidEvent = events.find(
      (event) => event.evidenceRefs.length === 0,
    );
    const stats = calculateUIKnowledgeInputStats({
      schemaVersion: bundle.schemaVersion,
      session: bundle.session,
      events,
      assets,
    });
    return {
      error:
        events.length === 0
          ? 'Keep at least one event.'
          : invalidEvent
            ? `Event ${invalidEvent.eventHashId} has no screenshot left.`
            : null,
      stats,
    };
  }, [bundle, excludedAssetIds, excludedEventHashIds]);

  const updateDecision = (
    nextExcludedAssetIds: string[],
    nextExcludedEventHashIds: string[],
  ) => {
    onDecisionChange({
      confirmed: true,
      excludedAssetIds: nextExcludedAssetIds,
      excludedEventHashIds: nextExcludedEventHashIds,
    });
  };
  const refsByAssetId = useMemo(() => {
    const refs = new Map<string, string[]>();
    for (const event of bundle.events) {
      for (const ref of event.evidenceRefs) {
        const aliases = refs.get(ref.assetId) ?? [];
        aliases.push(`${event.eventHashId} / ${ref.frameRole}`);
        refs.set(ref.assetId, aliases);
      }
    }
    return refs;
  }, [bundle.events]);

  return (
    <div className="studio-recorder-egress-summary">
      <p>
        Review the exact events and screenshots. Uncheck sensitive evidence
        before the single multimodal request.
      </p>
      <dl>
        <dt>Model</dt>
        <dd>{descriptor.modelName}</dd>
        <dt>Provider</dt>
        <dd>{descriptor.providerLabel}</dd>
        <dt>Endpoint</dt>
        <dd>{descriptor.endpointOrigin}</dd>
        {descriptor.proxyOrigin ? (
          <>
            <dt>Proxy</dt>
            <dd>{descriptor.proxyOrigin}</dd>
          </>
        ) : null}
        {descriptor.tracingDestinations.length > 0 ? (
          <>
            <dt>Tracing</dt>
            <dd>{descriptor.tracingDestinations.join(', ')}</dd>
          </>
        ) : null}
        <dt>Selected images</dt>
        <dd>
          {selection.stats.imageReferenceCount} references /{' '}
          {selection.stats.uniqueImageCount} unique
        </dd>
        <dt>Image payload</dt>
        <dd>
          {(selection.stats.totalImageEncodedBytes / 1024).toFixed(1)} KiB /{' '}
          {selection.stats.totalImageDataUrlChars.toLocaleString()} request
          characters
        </dd>
        <dt>Selected events</dt>
        <dd>
          {selection.stats.eligibleEventCount} eligible /{' '}
          {selection.stats.userActionCount} user actions
        </dd>
        <dt>Evidence text</dt>
        <dd>{selection.stats.textChars.toLocaleString()} characters</dd>
      </dl>

      <div className="studio-recorder-egress-evidence-section">
        <strong>Events</strong>
        <div className="studio-recorder-egress-event-list">
          {bundle.events.map((event) => {
            const included = !excludedEventHashIds.includes(event.eventHashId);
            return (
              <Checkbox
                checked={included}
                key={event.eventHashId}
                onChange={(changeEvent) => {
                  const next = toggleExcludedId(
                    excludedEventHashIds,
                    event.eventHashId,
                    changeEvent.target.checked,
                  );
                  setExcludedEventHashIds(next);
                  updateDecision(excludedAssetIds, next);
                }}
              >
                {event.knowledgeRole === 'user-action'
                  ? event.action.name
                  : 'Initial state'}{' '}
                · {event.eventHashId}
              </Checkbox>
            );
          })}
        </div>
      </div>

      <div className="studio-recorder-egress-evidence-section">
        <strong>Screenshots</strong>
        <div className="studio-recorder-egress-asset-grid">
          {bundle.assets.map((asset) => {
            const included = !excludedAssetIds.includes(asset.assetId);
            const aliases = refsByAssetId.get(asset.assetId) ?? [];
            return (
              <div className="studio-recorder-egress-asset" key={asset.assetId}>
                <img alt="Recorder evidence" src={asset.dataUrl} />
                <span>
                  <Checkbox
                    checked={included}
                    onChange={(changeEvent) => {
                      const next = toggleExcludedId(
                        excludedAssetIds,
                        asset.assetId,
                        changeEvent.target.checked,
                      );
                      setExcludedAssetIds(next);
                      updateDecision(next, excludedEventHashIds);
                    }}
                  >
                    Include screenshot
                  </Checkbox>
                  <small>
                    {aliases.length} reference{aliases.length === 1 ? '' : 's'}
                  </small>
                  <small title={asset.assetId}>
                    {asset.assetId.slice(0, 20)}…
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {selection.error ? (
        <div className="studio-recorder-egress-selection-error">
          {selection.error} Exclude that event or keep one of its screenshots.
        </div>
      ) : null}
    </div>
  );
}

export function StudioRecorderPanel({
  onShowMarkdown,
  onShowScreenshots,
}: StudioRecorderPanelProps = {}) {
  const { message, modal } = AntdApp.useApp();
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
    generateSessionKnowledge,
    exportSessionCode,
    exportSessionKnowledge,
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
  const [knowledgeGeneration, setKnowledgeGeneration] =
    useState<StudioRecorderKnowledgeGenerationState>({
      sessionId: null,
      status: 'idle',
      markdown: '',
      error: null,
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
  const persistedKnowledgeMarkdown =
    detailSession?.generatedKnowledge?.markdown || '';
  const knowledgeMarkdown =
    knowledgeGeneration.sessionId === detailSession?.id
      ? knowledgeGeneration.markdown || persistedKnowledgeMarkdown
      : persistedKnowledgeMarkdown;
  const isKnowledgeGenerating =
    knowledgeGeneration.status === 'generating' &&
    knowledgeGeneration.sessionId === detailSession?.id;
  const knowledgeError =
    knowledgeGeneration.status === 'error' &&
    knowledgeGeneration.sessionId === detailSession?.id
      ? knowledgeGeneration.error
      : null;
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

  const confirmKnowledgeEgress = useCallback(
    (descriptor: ModelEgressDescriptor, bundle: SessionEvidenceBundle) =>
      new Promise<UIKnowledgeEgressDecision>((resolve) => {
        let settled = false;
        let decision: UIKnowledgeEgressDecision = {
          confirmed: false,
          excludedAssetIds: [],
          excludedEventHashIds: [],
        };
        const settle = (confirmed: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({ ...decision, confirmed });
        };
        modal.confirm({
          title: 'Send recording screenshots to the model?',
          content: (
            <KnowledgeEgressReview
              bundle={bundle}
              descriptor={descriptor}
              onDecisionChange={(nextDecision) => {
                decision = nextDecision;
              }}
            />
          ),
          width: 760,
          okText: 'Generate',
          cancelText: 'Cancel',
          onOk: () => settle(true),
          onCancel: () => settle(false),
        });
      }),
    [modal],
  );

  const runKnowledgeGeneration = useCallback(
    async (sessionId: string, force = false) => {
      const session =
        sessions.find((item) => item.id === sessionId) ??
        (currentSession?.id === sessionId ? currentSession : null);
      setKnowledgeGeneration({
        sessionId,
        status: 'generating',
        markdown: session?.generatedKnowledge?.markdown || '',
        error: null,
      });

      try {
        const artifact = await generateSessionKnowledge(sessionId, {
          force,
          confirmEgress: confirmKnowledgeEgress,
        });
        if (!artifact) {
          setKnowledgeGeneration({
            sessionId,
            status: 'idle',
            markdown: session?.generatedKnowledge?.markdown || '',
            error: null,
          });
          return null;
        }
        setKnowledgeGeneration({
          sessionId,
          status: 'success',
          markdown: artifact.markdown,
          error: null,
        });
        message.success('Knowledge base generated successfully!');
        return artifact;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to generate knowledge base.';
        setKnowledgeGeneration({
          sessionId,
          status: 'error',
          markdown: '',
          error: errorMessage,
        });
        throw error;
      }
    },
    [
      confirmKnowledgeEgress,
      currentSession,
      generateSessionKnowledge,
      message,
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

  const handleCopyKnowledge = useCallback(async () => {
    if (!knowledgeMarkdown) {
      return;
    }
    await navigator.clipboard.writeText(knowledgeMarkdown);
    message.success('Knowledge base copied to clipboard');
  }, [knowledgeMarkdown, message]);

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
      isKnowledgeGenerating={isKnowledgeGenerating}
      knowledgeGeneration={knowledgeGeneration}
      knowledgeMarkdown={knowledgeMarkdown}
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
      onExportKnowledge={(format) => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() =>
          exportSessionKnowledge(detailSession.id, format),
        );
      }}
      onGenerateKnowledge={() => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() => runKnowledgeGeneration(detailSession.id));
      }}
      onKnowledgeTabClick={() => {
        setActiveTab('knowledge');
      }}
      onLanguageChange={handleLanguageChange}
      onCopyKnowledge={() => {
        void runPanelAction(handleCopyKnowledge);
      }}
      onRegenerateCode={() => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() =>
          runCodeGeneration(detailSession.id, activeCodeType, true),
        );
      }}
      onRegenerateKnowledge={() => {
        if (!detailSession) {
          return;
        }
        void runPanelAction(() =>
          runKnowledgeGeneration(detailSession.id, true),
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
      isKnowledgeGenerating={isKnowledgeGenerating}
      isRecording={state.isRecording}
      isStoppingRecording={isStoppingRecording}
      knowledgeError={knowledgeError}
      knowledgeMarkdown={knowledgeMarkdown}
      onCopyKnowledge={() => {
        void runPanelAction(handleCopyKnowledge);
      }}
      onExportKnowledge={(format) => {
        if (!recorderPanelSession) {
          return;
        }
        void runPanelAction(() =>
          exportSessionKnowledge(recorderPanelSession.id, format),
        );
      }}
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
      onGenerateKnowledge={() => {
        if (!recorderPanelSession) {
          return;
        }
        void runPanelAction(() =>
          runKnowledgeGeneration(recorderPanelSession.id),
        );
      }}
      onOpenKnowledge={() => {
        if (!recorderPanelSession || !knowledgeMarkdown) {
          return;
        }
        onShowMarkdown?.({
          markdown: knowledgeMarkdown,
          onDownload: () =>
            exportSessionKnowledge(recorderPanelSession.id, 'markdown'),
          title: 'KNOWLEDGE.md',
        });
      }}
      onRegenerateKnowledge={() => {
        if (!recorderPanelSession) {
          return;
        }
        void runPanelAction(() =>
          runKnowledgeGeneration(recorderPanelSession.id, true),
        );
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
