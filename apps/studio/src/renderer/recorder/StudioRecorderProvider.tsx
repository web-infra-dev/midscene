import type { PlaygroundPageRecordedEvent } from '@midscene/playground';
import { getDebug } from '@midscene/shared/logger';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useStudioPlayground } from '../playground/useStudioPlayground';
import { mapPageRecorderEventToStudioRecordedEvent } from './event-mapper';
import {
  createStudioRecorderMarkdownZipBase64,
  createStudioRecorderZipBase64,
  generateStudioRecorderJson,
  generateStudioRecorderPlaywright,
  generateStudioRecorderYaml,
  getStudioRecorderExportFileName,
  saveStudioRecorderFile,
} from './export';
import {
  canStartStudioRecording,
  createStudioRecorderTargetSignature,
  selectStudioRecorderTarget,
} from './selectors';
import {
  deleteStudioRecorderSession,
  getCurrentStudioRecorderSessionId,
  getStudioRecorderSessions,
  setCurrentStudioRecorderSessionId,
  upsertStudioRecorderSession,
} from './storage';
import type {
  StudioRecordedEvent,
  StudioRecorderContextValue,
  StudioRecorderGenerationProgress,
  StudioRecorderState,
  StudioRecorderTarget,
  StudioRecordingSession,
} from './types';
import { StudioRecorderContext } from './useStudioRecorder';

const debugRecorder = getDebug('studio:recorder', { console: true });

type StudioRecorderAction =
  | {
      type: 'initialize';
      sessions: StudioRecordingSession[];
      currentSessionId: string | null;
    }
  | { type: 'upsert-session'; session: StudioRecordingSession }
  | { type: 'delete-session'; sessionId: string }
  | { type: 'select-session'; sessionId: string | null }
  | { type: 'set-recording'; isRecording: boolean }
  | { type: 'set-error'; error: string | null };

const initialState: StudioRecorderState = {
  initialized: false,
  initializing: true,
  sessions: [],
  currentSessionId: null,
  isRecording: false,
  error: null,
};

function upsertSessionInState(
  state: StudioRecorderState,
  session: StudioRecordingSession,
): StudioRecorderState {
  const sessions = [
    session,
    ...state.sessions.filter((item) => item.id !== session.id),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    ...state,
    sessions,
    currentSessionId: session.id,
    isRecording: session.status === 'recording',
    error: null,
  };
}

function reducer(
  state: StudioRecorderState,
  action: StudioRecorderAction,
): StudioRecorderState {
  switch (action.type) {
    case 'initialize':
      return {
        ...state,
        initialized: true,
        initializing: false,
        sessions: action.sessions,
        currentSessionId:
          action.currentSessionId &&
          action.sessions.some(
            (session) => session.id === action.currentSessionId,
          )
            ? action.currentSessionId
            : (action.sessions[0]?.id ?? null),
      };
    case 'upsert-session': {
      return upsertSessionInState(state, action.session);
    }
    case 'delete-session': {
      const sessions = state.sessions.filter(
        (session) => session.id !== action.sessionId,
      );
      return {
        ...state,
        sessions,
        currentSessionId:
          state.currentSessionId === action.sessionId
            ? (sessions[0]?.id ?? null)
            : state.currentSessionId,
        isRecording:
          state.currentSessionId === action.sessionId
            ? false
            : state.isRecording,
      };
    }
    case 'select-session':
      return {
        ...state,
        currentSessionId: action.sessionId,
      };
    case 'set-recording':
      return {
        ...state,
        isRecording: action.isRecording,
      };
    case 'set-error':
      return {
        ...state,
        error: action.error,
        initializing: false,
      };
    default:
      return state;
  }
}

function createSessionId() {
  return `studio-recording-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createSessionName(target: StudioRecorderTarget) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${target.platformId} recording ${time}`;
}

function createSessionUrl(target: StudioRecorderTarget) {
  const url = target.values.url;
  return typeof url === 'string' ? url : '';
}

type StudioRecorderRuntime = {
  sessionId: string;
  cursor: number;
  stopping: boolean;
  getRecorderEvents: (since?: number) => Promise<{
    events: PlaygroundPageRecordedEvent[];
    nextIndex: number;
  }>;
  stopRecorderSession?: () => Promise<unknown>;
};

function upsertEvent(
  session: StudioRecordingSession,
  event: StudioRecordedEvent,
): StudioRecordingSession {
  if (session.events.some((item) => item.hashId === event.hashId)) {
    return session;
  }

  return {
    ...session,
    events: [...session.events, event],
    updatedAt: Date.now(),
  };
}

function hasRecorderSession(session: StudioRecordingSession | null): boolean {
  return session !== null;
}

export function StudioRecorderProvider({ children }: PropsWithChildren) {
  const studioPlayground = useStudioPlayground();
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const currentTarget = useMemo(
    () => selectStudioRecorderTarget(studioPlayground),
    [studioPlayground],
  );
  const currentTargetSignature = useMemo(
    () => createStudioRecorderTargetSignature(currentTarget),
    [currentTarget],
  );
  const canStartRecording = canStartStudioRecording(
    studioPlayground,
    currentTarget,
  );

  const currentSession = useMemo(
    () =>
      state.sessions.find((session) => session.id === state.currentSessionId) ??
      null,
    [state.currentSessionId, state.sessions],
  );
  const recordPageEventRef = useRef<
    (event: PlaygroundPageRecordedEvent) => Promise<void>
  >(async () => undefined);
  const recorderRuntimeRef = useRef<StudioRecorderRuntime | null>(null);

  const drainRecorderRuntime = useCallback(async (sessionId: string) => {
    const runtime = recorderRuntimeRef.current;
    if (!runtime || runtime.sessionId !== sessionId) {
      return;
    }

    const result = await runtime.getRecorderEvents(runtime.cursor);
    runtime.cursor = result.nextIndex;
    for (const event of result.events) {
      await recordPageEventRef.current(event);
    }
  }, []);

  const stopRecorderRuntime = useCallback(
    async (sessionId: string) => {
      const runtime = recorderRuntimeRef.current;
      if (!runtime || runtime.sessionId !== sessionId || runtime.stopping) {
        return;
      }

      runtime.stopping = true;
      try {
        await runtime.stopRecorderSession?.();
      } catch (error) {
        debugRecorder('failed to stop server recorder session:', error);
      }

      try {
        await drainRecorderRuntime(sessionId);
      } catch (error) {
        debugRecorder('failed to drain recorder events:', error);
      } finally {
        if (recorderRuntimeRef.current === runtime) {
          recorderRuntimeRef.current = null;
        }
      }
    },
    [drainRecorderRuntime],
  );

  const stopRecording = useCallback(async () => {
    const snapshot = stateRef.current;
    const session = snapshot.sessions.find(
      (item) => item.id === snapshot.currentSessionId,
    );
    if (!snapshot.isRecording || !session) {
      return;
    }

    await stopRecorderRuntime(session.id);
    const latestSnapshot = stateRef.current;
    const latestSession =
      latestSnapshot.sessions.find((item) => item.id === session.id) ?? session;

    const updatedSession: StudioRecordingSession = {
      ...latestSession,
      status: 'completed',
      stoppedAt: Date.now(),
      updatedAt: Date.now(),
    };
    stateRef.current = upsertSessionInState(latestSnapshot, updatedSession);
    dispatch({ type: 'upsert-session', session: updatedSession });
    dispatch({ type: 'set-recording', isRecording: false });
    await upsertStudioRecorderSession(updatedSession);
  }, [stopRecorderRuntime]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getStudioRecorderSessions(),
      getCurrentStudioRecorderSessionId(),
    ])
      .then(([sessions, currentSessionId]) => {
        if (cancelled) {
          return;
        }
        dispatch({
          type: 'initialize',
          sessions,
          currentSessionId,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'set-error',
            error:
              error instanceof Error
                ? error.message
                : 'Failed to initialize recorder storage.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    if (!canStartRecording || !currentTarget) {
      return null;
    }

    const now = Date.now();
    const session: StudioRecordingSession = {
      id: createSessionId(),
      name: createSessionName(currentTarget),
      description: '',
      url: createSessionUrl(currentTarget),
      status: 'recording',
      target: currentTarget,
      events: [],
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    };
    await upsertStudioRecorderSession(session);
    await setCurrentStudioRecorderSessionId(session.id);
    stateRef.current = upsertSessionInState(stateRef.current, session);
    dispatch({ type: 'upsert-session', session });
    return session;
  }, [canStartRecording, currentTarget]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (stateRef.current.currentSessionId === sessionId) {
        await stopRecording();
      }
      await deleteStudioRecorderSession(sessionId);
      const nextSessions = stateRef.current.sessions.filter(
        (session) => session.id !== sessionId,
      );
      const nextCurrentSessionId =
        stateRef.current.currentSessionId === sessionId
          ? (nextSessions[0]?.id ?? null)
          : stateRef.current.currentSessionId;
      await setCurrentStudioRecorderSessionId(nextCurrentSessionId);
      dispatch({ type: 'delete-session', sessionId });
    },
    [stopRecording],
  );

  const selectSession = useCallback((sessionId: string) => {
    void setCurrentStudioRecorderSessionId(sessionId);
    dispatch({ type: 'select-session', sessionId });
  }, []);

  const generateSessionCode = useCallback(
    async (
      sessionId: string,
      options: {
        type?: StudioRecorderCodeType;
        force?: boolean;
        language?: string;
        onChunk?: (content: string) => void;
        onProgress?: (progress: StudioRecorderGenerationProgress) => void;
      } = {},
    ) => {
      const type = options.type || 'markdown';
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session) {
        throw new Error('Recorder session not found.');
      }
      const cachedCode = session.generatedCode?.[type];
      if (cachedCode && !options.force) {
        options.onChunk?.(cachedCode);
        return cachedCode;
      }
      if (session.events.length === 0) {
        throw new Error(`Record at least one event before generating ${type}.`);
      }
      if (type === 'playwright' && session.target.platformId !== 'web') {
        throw new Error(
          'Playwright generation is only available for Web recordings.',
        );
      }

      options.onProgress?.({
        step: 'prepare',
        status: 'completed',
        details: `Prepared ${session.events.length} recorded events`,
      });

      const {
        generateStudioRecorderCodeWithAI,
        generateStudioRecorderMetadataWithAI,
      } = await import('./codegen');
      let sessionForCodegen = session;
      if (!session.metadataGeneratedAt) {
        try {
          options.onProgress?.({
            step: 'metadata',
            status: 'loading',
            details: 'Analyzing session content...',
          });
          const metadata = await generateStudioRecorderMetadataWithAI(session);
          if (metadata.title || metadata.description) {
            sessionForCodegen = {
              ...session,
              name: metadata.title || session.name,
              description: metadata.description || session.description,
              metadataGeneratedAt: Date.now(),
              updatedAt: Date.now(),
            };
            stateRef.current = upsertSessionInState(
              stateRef.current,
              sessionForCodegen,
            );
            dispatch({ type: 'upsert-session', session: sessionForCodegen });
            await upsertStudioRecorderSession(sessionForCodegen);
            options.onProgress?.({
              step: 'metadata',
              status: 'completed',
              details: `Generated: "${sessionForCodegen.name}"`,
            });
          } else {
            options.onProgress?.({
              step: 'metadata',
              status: 'completed',
              details: `Using existing: "${sessionForCodegen.name}"`,
            });
          }
        } catch (error) {
          debugRecorder('failed to generate recorder metadata:', error);
          options.onProgress?.({
            step: 'metadata',
            status: 'completed',
            details: `Using existing: "${sessionForCodegen.name}"`,
          });
        }
      } else {
        options.onProgress?.({
          step: 'metadata',
          status: 'completed',
          details: `Using existing: "${sessionForCodegen.name}"`,
        });
      }

      options.onProgress?.({
        step: 'code',
        status: 'loading',
        details:
          type === 'playwright'
            ? 'Generating Playwright test code...'
            : type === 'markdown'
              ? `Generating Markdown replay${
                  options.language ? ` in ${options.language}` : ''
                }...`
              : `Generating YAML configuration${
                  options.language ? ` in ${options.language}` : ''
                }...`,
      });
      let code: string;
      try {
        code = await generateStudioRecorderCodeWithAI(sessionForCodegen, {
          type,
          language: options.language,
          onChunk: options.onChunk,
        });
      } catch (error) {
        options.onProgress?.({
          step: 'code',
          status: 'error',
          details:
            error instanceof Error
              ? error.message
              : `Failed to generate ${type}.`,
        });
        throw error;
      }
      options.onProgress?.({
        step: 'code',
        status: 'completed',
      });
      const updatedSession: StudioRecordingSession = {
        ...sessionForCodegen,
        generatedCode: {
          ...sessionForCodegen.generatedCode,
          [type]: code,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      };
      stateRef.current = upsertSessionInState(stateRef.current, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      await upsertStudioRecorderSession(updatedSession);
      return code;
    },
    [],
  );

  const generateSessionYaml = useCallback(
    async (
      sessionId: string,
      options: {
        force?: boolean;
        language?: string;
        onChunk?: (content: string) => void;
        onProgress?: (progress: StudioRecorderGenerationProgress) => void;
      } = {},
    ) =>
      generateSessionCode(sessionId, {
        ...options,
        type: 'yaml',
      }),
    [generateSessionCode],
  );

  const recordPageEvent = useCallback(
    async (event: PlaygroundPageRecordedEvent) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find(
        (item) => item.id === snapshot.currentSessionId,
      );
      if (!snapshot.isRecording || !session || !hasRecorderSession(session)) {
        return;
      }

      const studioEvent = mapPageRecorderEventToStudioRecordedEvent({
        event,
        target: session.target,
      });
      const updatedSession = upsertEvent(session, studioEvent);
      if (updatedSession === session) {
        return;
      }

      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      await upsertStudioRecorderSession(updatedSession);
    },
    [],
  );
  recordPageEventRef.current = recordPageEvent;

  useEffect(() => {
    const session = state.sessions.find(
      (item) => item.id === state.currentSessionId,
    );
    if (
      studioPlayground.phase !== 'ready' ||
      !state.isRecording ||
      !hasRecorderSession(session ?? null)
    ) {
      return;
    }

    const { playgroundSDK } = studioPlayground.controller.state;
    if (
      typeof playgroundSDK.startRecorderSession !== 'function' ||
      typeof playgroundSDK.getRecorderEvents !== 'function'
    ) {
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const pollEvents = async () => {
      if (cancelled || !session) {
        return;
      }
      await drainRecorderRuntime(session.id);
    };

    const startPageRecorder = async () => {
      if (!session) {
        return;
      }

      recorderRuntimeRef.current = {
        sessionId: session.id,
        cursor: 0,
        stopping: false,
        getRecorderEvents: playgroundSDK.getRecorderEvents.bind(playgroundSDK),
        stopRecorderSession:
          typeof playgroundSDK.stopRecorderSession === 'function'
            ? playgroundSDK.stopRecorderSession.bind(playgroundSDK)
            : undefined,
      };

      const result = await playgroundSDK.startRecorderSession(session.id);
      if (cancelled) {
        void stopRecorderRuntime(session.id);
        return;
      }

      if (!result.ok) {
        const error =
          result.error || 'Recorder is unavailable for the current target.';
        debugRecorder('server recorder is unavailable: %s', error);
        await stopRecording();
        dispatch({ type: 'set-error', error });
        return;
      }

      if (result.supported === false) {
        const error =
          result.error || 'Current target does not expose a recorder source.';
        debugRecorder('recorder source unavailable: %s', error);
        await stopRecording();
        dispatch({ type: 'set-error', error });
        return;
      }

      await pollEvents();
      if (cancelled) {
        return;
      }
      pollTimer = setInterval(() => {
        void pollEvents();
      }, 500);
    };

    void startPageRecorder();

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (session) {
        void stopRecorderRuntime(session.id);
      }
    };
  }, [
    state.isRecording,
    state.currentSessionId,
    currentSession?.target.platformId,
    studioPlayground.phase === 'ready'
      ? studioPlayground.controller.state.playgroundSDK
      : null,
    drainRecorderRuntime,
    stopRecording,
    stopRecorderRuntime,
  ]);

  const exportSessionJson = useCallback(async (sessionId: string) => {
    const session = stateRef.current.sessions.find(
      (item) => item.id === sessionId,
    );
    if (!session) {
      return;
    }
    await saveStudioRecorderFile({
      title: 'Export Recorder JSON',
      defaultFileName: getStudioRecorderExportFileName(session, 'json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: generateStudioRecorderJson(session),
    });
  }, []);

  const exportSessionYaml = useCallback(async (sessionId: string) => {
    const session = stateRef.current.sessions.find(
      (item) => item.id === sessionId,
    );
    if (!session) {
      return;
    }
    await saveStudioRecorderFile({
      title: 'Export Recorder YAML',
      defaultFileName: getStudioRecorderExportFileName(session, 'yaml'),
      filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
      content:
        session.generatedCode?.yaml || generateStudioRecorderYaml(session),
    });
  }, []);

  const exportSessionCode = useCallback(
    async (sessionId: string, type: StudioRecorderCodeType) => {
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session) {
        return;
      }

      if (type === 'yaml') {
        await exportSessionYaml(sessionId);
        return;
      }

      if (type === 'markdown') {
        await saveStudioRecorderFile({
          title: 'Export Recorder Markdown Replay',
          defaultFileName: getStudioRecorderExportFileName(
            session,
            'markdown.zip',
          ),
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
          content: await createStudioRecorderMarkdownZipBase64(session),
          encoding: 'base64',
        });
        return;
      }

      const playwright =
        session.generatedCode?.playwright ||
        generateStudioRecorderPlaywright(session);
      if (!playwright) {
        throw new Error(
          'Playwright export is only available for Web recordings.',
        );
      }
      await saveStudioRecorderFile({
        title: 'Export Recorder Playwright Test',
        defaultFileName: getStudioRecorderExportFileName(session, 'spec.ts'),
        filters: [{ name: 'Playwright Test', extensions: ['ts'] }],
        content: playwright,
      });
    },
    [exportSessionYaml],
  );

  const exportAllZip = useCallback(async () => {
    const sessions = stateRef.current.sessions;
    if (!sessions.length) {
      return;
    }
    await saveStudioRecorderFile({
      title: 'Export Recorder Archive',
      defaultFileName: 'midscene-studio-recordings.zip',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      content: await createStudioRecorderZipBase64(sessions),
      encoding: 'base64',
    });
  }, []);

  useEffect(() => {
    if (state.isRecording && !canStartRecording) {
      void stopRecording();
    }
  }, [canStartRecording, state.isRecording, stopRecording]);

  const recordingTargetSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.isRecording) {
      recordingTargetSignatureRef.current = currentTargetSignature;
      return;
    }
    if (!recordingTargetSignatureRef.current) {
      recordingTargetSignatureRef.current = currentTargetSignature;
      return;
    }
    if (
      currentTargetSignature &&
      recordingTargetSignatureRef.current !== currentTargetSignature
    ) {
      void stopRecording();
    }
  }, [currentTargetSignature, state.isRecording, stopRecording]);

  const contextValue = useMemo<StudioRecorderContextValue>(
    () => ({
      state,
      currentSession,
      currentTarget,
      canStartRecording,
      startRecording,
      stopRecording,
      deleteSession,
      selectSession,
      generateSessionYaml,
      generateSessionCode,
      exportSessionJson,
      exportSessionYaml,
      exportSessionCode,
      exportAllZip,
    }),
    [
      canStartRecording,
      currentSession,
      currentTarget,
      deleteSession,
      exportAllZip,
      exportSessionJson,
      exportSessionYaml,
      exportSessionCode,
      generateSessionCode,
      generateSessionYaml,
      selectSession,
      startRecording,
      state,
      stopRecording,
    ],
  );

  return (
    <StudioRecorderContext.Provider value={contextValue}>
      {children}
    </StudioRecorderContext.Provider>
  );
}
