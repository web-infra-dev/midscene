import { RecordTimeline } from '@midscene/recorder';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  StudioRecorderGenerationProgress,
  StudioRecorderGenerationStepId,
  StudioRecorderGenerationStepStatus,
  StudioRecordingSession,
} from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import './studio-recorder-panel.css';

const CODE_TYPE_STORAGE_KEY = 'studio.recorder.defaultCodeType';
const LANGUAGE_STORAGE_KEY = 'studio.recorder.yamlLanguage';

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'English', label: 'English' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
];

function TimelineIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M4 5h16M4 12h16M4 19h16" stroke="currentColor" />
      <path d="M8 3v4M16 10v4M11 17v4" stroke="currentColor" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M8 9l-3 3 3 3" stroke="currentColor" />
      <path d="M16 9l3 3-3 3" stroke="currentColor" />
      <path d="M13 5l-2 14" stroke="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <rect height="12" rx="2" stroke="currentColor" width="12" x="8" y="8" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        stroke="currentColor"
      />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M20 12a8 8 0 1 1-2.35-5.66" stroke="currentColor" />
      <path d="M20 4v6h-6" stroke="currentColor" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M12 4v11" stroke="currentColor" />
      <path d="M8 11l4 4 4-4" stroke="currentColor" />
      <path d="M5 20h14" stroke="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" stroke="currentColor" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
      />
      <path d="m14 8 3 3" stroke="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="M4 7h16" stroke="currentColor" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" />
      <path d="M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path d="m5 12 4 4L19 6" stroke="currentColor" />
    </svg>
  );
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function platformLabel(platformId: string) {
  return platformId.charAt(0).toUpperCase() + platformId.slice(1);
}

async function runPanelAction<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Recorder failed.');
    return undefined;
  }
}

function readPersistedCodeType(): StudioRecorderCodeType {
  if (typeof window === 'undefined') {
    return 'yaml';
  }
  return window.localStorage.getItem(CODE_TYPE_STORAGE_KEY) === 'playwright'
    ? 'playwright'
    : 'yaml';
}

function readPersistedLanguage() {
  if (typeof window === 'undefined') {
    return 'auto';
  }
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'auto';
}

function getSessionTargetText(session: StudioRecordingSession) {
  if (session.url) {
    return session.url;
  }
  const targetUrl = session.target.values.url;
  if (typeof targetUrl === 'string' && targetUrl) {
    return targetUrl;
  }
  return session.target.label || platformLabel(session.target.platformId);
}

function getSessionTargetLabel(session: StudioRecordingSession) {
  return session.url || session.target.platformId === 'web' ? 'URL' : 'Target';
}

function isPlaywrightAvailable(session: StudioRecordingSession | null) {
  return session?.target.platformId === 'web';
}

function getAvailableCodeType(
  session: StudioRecordingSession | null,
  preferredType: StudioRecorderCodeType,
): StudioRecorderCodeType {
  if (preferredType === 'playwright' && !isPlaywrightAvailable(session)) {
    return 'yaml';
  }
  return preferredType;
}

type StudioRecorderTab = 'timeline' | 'code';
type StudioRecorderGenerationStepState = Record<
  StudioRecorderGenerationStepId,
  {
    status: StudioRecorderGenerationStepStatus;
    details?: string;
  }
>;

type StudioRecorderGenerationState = {
  sessionId: string | null;
  type: StudioRecorderCodeType;
  status: 'idle' | 'generating' | 'success' | 'error';
  content: string;
  error: string | null;
  steps: StudioRecorderGenerationStepState;
};

function createInitialGenerationSteps(): StudioRecorderGenerationStepState {
  return {
    prepare: { status: 'pending' },
    metadata: { status: 'pending' },
    code: { status: 'pending' },
  };
}

function mergeGenerationProgress(
  steps: StudioRecorderGenerationStepState,
  progress: StudioRecorderGenerationProgress,
): StudioRecorderGenerationStepState {
  return {
    ...steps,
    [progress.step]: {
      status: progress.status,
      details: progress.details,
    },
  };
}

function getGenerationStepState(status: StudioRecorderGenerationStepStatus) {
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'loading') {
    return 'running';
  }
  if (status === 'error') {
    return 'error';
  }
  return 'idle';
}

function getGenerationSteps(
  type: StudioRecorderCodeType,
  steps: StudioRecorderGenerationStepState,
) {
  const codeLabel = type === 'playwright' ? 'Playwright Code' : 'YAML';
  return [
    {
      title: 'Prepare Recorded Events',
      description: 'Collecting timeline events and target metadata',
      details: steps.prepare.details,
      state: getGenerationStepState(steps.prepare.status),
    },
    {
      title: 'Generate Title & Description',
      description: 'Creating session title and description using AI',
      details: steps.metadata.details,
      state: getGenerationStepState(steps.metadata.status),
    },
    {
      title: `Generate ${codeLabel}`,
      description:
        type === 'playwright'
          ? 'Creating executable Playwright test code'
          : 'Creating YAML configuration',
      details: steps.code.details,
      state: getGenerationStepState(steps.code.status),
    },
  ] as const;
}

export function StudioRecorderPanel() {
  const recorder = useStudioRecorder();
  const {
    state,
    currentSession,
    currentTarget,
    canStartRecording,
    startRecording,
    stopRecording,
    deleteSession,
    selectSession,
    generateSessionCode,
    exportSessionCode,
    exportAllZip,
  } = recorder;
  const sessions = state.sessions;
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudioRecorderTab>('timeline');
  const [selectedCodeType, setSelectedCodeType] =
    useState<StudioRecorderCodeType>(readPersistedCodeType);
  const [selectedLanguage, setSelectedLanguage] = useState(
    readPersistedLanguage,
  );
  const [generation, setGeneration] = useState<StudioRecorderGenerationState>({
    sessionId: null,
    type: 'yaml',
    status: 'idle',
    content: '',
    error: null,
    steps: createInitialGenerationSteps(),
  });

  const detailSession = useMemo(() => {
    const selectedSession =
      sessions.find((session) => session.id === detailSessionId) ?? null;
    if (selectedSession) {
      return selectedSession;
    }
    return state.isRecording ? currentSession : null;
  }, [currentSession, detailSessionId, sessions, state.isRecording]);
  const activeCodeType = getAvailableCodeType(detailSession, selectedCodeType);
  const activeGeneratedCode =
    detailSession?.generatedCode?.[activeCodeType] || '';
  const activeCode =
    generation.sessionId === detailSession?.id &&
    generation.type === activeCodeType
      ? generation.content || activeGeneratedCode
      : activeGeneratedCode;
  const codeLabel = activeCodeType === 'playwright' ? 'Playwright' : 'YAML';
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
    if (
      detailSessionId &&
      !sessions.some((session) => session.id === detailSessionId)
    ) {
      setDetailSessionId(null);
      setActiveTab('timeline');
    }
  }, [detailSessionId, sessions]);

  useEffect(() => {
    if (
      selectedCodeType === 'playwright' &&
      !isPlaywrightAvailable(detailSession)
    ) {
      setSelectedCodeType('yaml');
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
            type === 'yaml' && selectedLanguage !== 'auto'
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
        message.success(
          type === 'playwright'
            ? 'AI Playwright test generated successfully!'
            : 'AI YAML configuration generated successfully!',
        );
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
    state.isRecording,
  ]);

  const handleCopyCode = useCallback(async () => {
    if (!activeCode) {
      return;
    }
    await navigator.clipboard.writeText(activeCode);
    message.success(`${codeLabel} copied to clipboard`);
  }, [activeCode, codeLabel]);

  const renderList = () => {
    if (sessions.length === 0) {
      return (
        <div className="studio-recorder-empty">
          No recordings yet. Start a new recording after a device is live.
        </div>
      );
    }

    return (
      <div className="studio-recorder-list">
        {sessions.map((session) => (
          <article
            className="studio-recorder-card"
            key={session.id}
            onClick={() => openDetail(session.id)}
          >
            <div className="studio-recorder-card-body">
              <div className="studio-recorder-card-title">{session.name}</div>
              {session.description ? (
                <div className="studio-recorder-card-summary">
                  {session.description}
                </div>
              ) : null}
              <div className="studio-recorder-card-target">
                {getSessionTargetLabel(session)}:{' '}
                {getSessionTargetText(session)}
              </div>
              <div className="studio-recorder-card-time">
                {formatDate(session.createdAt)}
              </div>
            </div>
            <div className="studio-recorder-card-actions">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  openDetail(session.id, 'timeline');
                }}
                title="Open recording"
                type="button"
              >
                <EditIcon />
              </button>
              <button
                disabled={session.events.length === 0}
                onClick={(event) => {
                  event.stopPropagation();
                  void runPanelAction(() =>
                    exportSessionCode(session.id, 'yaml'),
                  );
                }}
                title="Download generated YAML"
                type="button"
              >
                <DownloadIcon />
              </button>
              <button
                disabled={
                  state.isRecording && session.id === currentSession?.id
                }
                onClick={(event) => {
                  event.stopPropagation();
                  void runPanelAction(async () => {
                    await deleteSession(session.id);
                    if (detailSessionId === session.id) {
                      setDetailSessionId(null);
                    }
                  });
                }}
                title="Delete recording"
                type="button"
              >
                <TrashIcon />
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderGenerationStatus = () => {
    if (!detailSession || generation.sessionId !== detailSession.id) {
      return null;
    }
    if (generation.status !== 'generating') {
      return null;
    }

    if (generation.steps.code.status === 'loading') {
      return (
        <div className="studio-recorder-generating-card">
          <span>Generating code...</span>
          <span className="studio-recorder-generating-pill">Analyzing...</span>
        </div>
      );
    }

    const steps = getGenerationSteps(generation.type, generation.steps);
    return (
      <div className="studio-recorder-generation">
        <div className="studio-recorder-generation-steps">
          {steps.map((step) => (
            <div
              className={`studio-recorder-generation-step studio-recorder-generation-step-${step.state}`}
              key={step.title}
            >
              <span className="studio-recorder-generation-step-marker">
                {step.state === 'success' ? <CheckIcon /> : null}
              </span>
              <div>
                <div className="studio-recorder-generation-step-title">
                  {step.title}
                </div>
                <div className="studio-recorder-generation-step-description">
                  {step.description}
                </div>
                {step.details ? (
                  <div className="studio-recorder-generation-step-details">
                    {step.details}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!detailSession) {
      return renderList();
    }

    return (
      <section className="studio-recorder-detail">
        <div className="studio-recorder-detail-nav">
          <button
            className="studio-recorder-inline-icon-button"
            onClick={() => {
              setDetailSessionId(null);
              setActiveTab('timeline');
            }}
            title="Back to recordings"
            type="button"
          >
            <BackIcon />
          </button>
          <div className="studio-recorder-session-heading">
            <div className="studio-recorder-session-title">
              {detailSession.name}
            </div>
            <div className="studio-recorder-session-meta">
              {platformLabel(detailSession.target.platformId)} /{' '}
              {detailSession.target.label} / {detailSession.events.length}{' '}
              events
            </div>
          </div>
        </div>

        <div className="studio-recorder-tabs">
          <button
            className={
              activeTab === 'timeline'
                ? 'studio-recorder-tab studio-recorder-tab-active'
                : 'studio-recorder-tab'
            }
            onClick={() => setActiveTab('timeline')}
            type="button"
          >
            <TimelineIcon />
            <span>Record Timeline</span>
          </button>
          <span className="studio-recorder-tab-arrow">
            <ArrowIcon />
          </span>
          <button
            className={
              activeTab === 'code'
                ? 'studio-recorder-tab studio-recorder-tab-active'
                : 'studio-recorder-tab'
            }
            disabled={detailSession.events.length === 0}
            onClick={handleCodeTabClick}
            title={
              detailSession.events.length === 0
                ? 'Record events before generating code'
                : undefined
            }
            type="button"
          >
            <CodeIcon />
            <span>Generate code</span>
          </button>
        </div>

        {activeTab === 'timeline' ? (
          detailSession.events.length > 0 ? (
            <div className="studio-recorder-timeline">
              <RecordTimeline events={detailSession.events} />
            </div>
          ) : (
            <div className="studio-recorder-empty">
              Operate the connected device while recording to capture events.
            </div>
          )
        ) : (
          <div className="studio-recorder-code-pane">
            <div className="studio-recorder-code-toolbar">
              <label className="studio-recorder-select-shell studio-recorder-code-type-select">
                <CodeIcon />
                <select
                  disabled={isGenerating}
                  onChange={(event) => {
                    const nextType = event.target
                      .value as StudioRecorderCodeType;
                    setSelectedCodeType(nextType);
                    window.localStorage.setItem(
                      CODE_TYPE_STORAGE_KEY,
                      nextType,
                    );
                    if (
                      detailSession.events.length > 0 &&
                      !detailSession.generatedCode?.[nextType]
                    ) {
                      void runPanelAction(() =>
                        runCodeGeneration(detailSession.id, nextType),
                      );
                    }
                  }}
                  value={activeCodeType}
                >
                  <option value="yaml">YAML</option>
                  <option
                    disabled={!isPlaywrightAvailable(detailSession)}
                    value="playwright"
                  >
                    Playwright
                  </option>
                </select>
              </label>

              {activeCodeType === 'yaml' ? (
                <label className="studio-recorder-select-shell studio-recorder-language-select">
                  <select
                    disabled={isGenerating}
                    onChange={(event) => {
                      const nextLanguage = event.target.value;
                      setSelectedLanguage(nextLanguage);
                      window.localStorage.setItem(
                        LANGUAGE_STORAGE_KEY,
                        nextLanguage,
                      );
                    }}
                    value={selectedLanguage}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="studio-recorder-code-spacer" />
              <button
                disabled={!activeCode || isGenerating}
                onClick={() => {
                  void runPanelAction(handleCopyCode);
                }}
                title={`Copy ${codeLabel}`}
                type="button"
              >
                <CopyIcon />
              </button>
              <button
                disabled={isGenerating || detailSession.events.length === 0}
                onClick={() => {
                  void runPanelAction(() =>
                    runCodeGeneration(detailSession.id, activeCodeType, true),
                  );
                }}
                title={`Regenerate ${codeLabel}`}
                type="button"
              >
                <ReloadIcon />
              </button>
              <button
                disabled={!activeCode || isGenerating}
                onClick={() => {
                  void runPanelAction(() =>
                    exportSessionCode(detailSession.id, activeCodeType),
                  );
                }}
                title={`Download ${codeLabel}`}
                type="button"
              >
                <DownloadIcon />
              </button>
            </div>

            {renderGenerationStatus()}

            {detailSession.events.length === 0 ? (
              <div className="studio-recorder-empty">
                Record events before generating code.
              </div>
            ) : generation.status === 'error' &&
              generation.sessionId === detailSession.id &&
              generation.type === activeCodeType ? (
              <div className="studio-recorder-notice">
                {generation.error || `Failed to generate ${codeLabel}.`}
              </div>
            ) : isGenerating ? null : activeCode ? (
              <pre className="studio-recorder-code-block">{activeCode}</pre>
            ) : (
              <div className="studio-recorder-empty">
                Generated code will appear here.
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="studio-recorder-panel">
      <div className="studio-recorder-toolbar">
        <div>
          <div className="studio-recorder-title">Record All</div>
          <div className="studio-recorder-subtitle">{statusText}</div>
        </div>
        <button
          className="studio-recorder-icon-button"
          disabled={sessions.length === 0}
          onClick={() => {
            void runPanelAction(exportAllZip);
          }}
          title="Export all recordings"
          type="button"
        >
          <DownloadIcon />
        </button>
      </div>

      {state.error ? (
        <div className="studio-recorder-notice">{state.error}</div>
      ) : null}

      <div className="studio-recorder-content">{renderDetail()}</div>

      <div className="studio-recorder-footer">
        {state.isRecording ? (
          <button
            className="studio-recorder-primary studio-recorder-stop"
            onClick={() => {
              void runPanelAction(async () => {
                const sessionId = currentSession?.id;
                const generationType = getAvailableCodeType(
                  currentSession,
                  selectedCodeType,
                );
                await stopRecording();
                if (sessionId) {
                  await runCodeGeneration(sessionId, generationType, true);
                }
              });
            }}
            type="button"
          >
            Stop Recording
          </button>
        ) : (
          <button
            className="studio-recorder-primary"
            disabled={!canStartRecording}
            onClick={() => {
              void runPanelAction(async () => {
                const session = await startRecording();
                if (session) {
                  openDetail(session.id);
                }
              });
            }}
            type="button"
          >
            + New Recording
          </button>
        )}
      </div>
    </div>
  );
}
