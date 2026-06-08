import type { PlaygroundPageRecordedEvent } from '@midscene/playground';
import { getDebug } from '@midscene/shared/logger';
import { getMidsceneRecorderEventDescription } from '@midscene/shared/recorder';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { message } from 'antd';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useStudioPlayground } from '../playground/useStudioPlayground';
import { mapPreviewRecorderEventToStudioRecordedEvent } from './event-mapper';
import {
  createStudioRecorderMarkdownZipBase64,
  createStudioRecorderZipBase64,
  generateStudioRecorderJson,
  generateStudioRecorderPlaywright,
  generateStudioRecorderYaml,
  getStudioRecorderExportVariantFileName,
  saveStudioRecorderFile,
} from './export';
import { createSecureRecorderId } from './secure-id';
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
const RECORDER_DESCRIPTION_CONCURRENCY = 2;
const RECORDER_DESCRIPTION_IDLE_TIMEOUT_MS = 5000;
const RECORDER_DESCRIPTION_TASK_TIMEOUT_MS = 15000;

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
  return createSecureRecorderId(`studio-recording-${Date.now()}`);
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

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxLength - 3, 0)).trim()}...`;
}

function eventVerb(event: StudioRecordedEvent) {
  switch (event.type) {
    case 'click':
      return 'Click';
    case 'input':
      return 'Input';
    case 'keydown':
      return 'Press';
    case 'scroll':
      return 'Scroll';
    case 'drag':
      return 'Drag';
    case 'navigation':
      return 'Navigate';
    default:
      return event.actionType || event.type;
  }
}

function isCoordinateDescription(value?: string) {
  return Boolean(value && /^\(?\d+(?:\.\d+)?,\s*\d+(?:\.\d+)?\)?/.test(value));
}

function isPendingRecorderDescription(value?: string) {
  return value?.trim() === 'AI is analyzing element...';
}

function getSemanticEventDescription(event: StudioRecordedEvent) {
  const description =
    event.elementDescription ||
    event.replayInstruction ||
    event.actionSummary ||
    getMidsceneRecorderEventDescription(event);
  if (isCoordinateDescription(description)) {
    return '';
  }
  return description;
}

function createLocalSessionSummary(events: StudioRecordedEvent[]) {
  const descriptions = events
    .filter((event) => !event.descriptionLoading)
    .map((event) => {
      const description = getSemanticEventDescription(event);
      return description ? `${eventVerb(event)} ${description}` : '';
    })
    .filter(Boolean)
    .slice(0, 4);

  if (descriptions.length === 0) {
    return '';
  }

  return truncateText(`The user ${descriptions.join(', ')}.`, 180);
}

function createLocalSessionName(
  session: StudioRecordingSession,
  events: StudioRecordedEvent[],
) {
  const firstSemanticEvent = events.find((event) => {
    if (event.descriptionLoading) {
      return false;
    }
    return Boolean(getSemanticEventDescription(event));
  });
  if (!firstSemanticEvent) {
    return session.name;
  }
  return truncateText(
    `${eventVerb(firstSemanticEvent)} ${getSemanticEventDescription(
      firstSemanticEvent,
    )}`,
    72,
  );
}

function applyLocalSessionSummary(
  session: StudioRecordingSession,
): StudioRecordingSession {
  if (session.metadataGeneratedAt) {
    return session;
  }
  const description = createLocalSessionSummary(session.events);
  const name = createLocalSessionName(session, session.events);
  if (!description && name === session.name) {
    return session;
  }
  return {
    ...session,
    name,
    description: description || session.description,
  };
}

function shouldDescribeRecorderEvent(event: StudioRecordedEvent) {
  if (event.source !== 'studio-preview') {
    return false;
  }
  if (event.type === 'navigation' || event.type === 'setViewport') {
    return false;
  }
  if (event.descriptionLoading === false && event.descriptionSource === 'ai') {
    return false;
  }
  return Boolean(event.screenshotBefore || event.screenshotAfter);
}

function createPendingRecorderEvent(
  event: StudioRecordedEvent,
): StudioRecordedEvent {
  if (!shouldDescribeRecorderEvent(event)) {
    return {
      ...event,
      descriptionLoading: false,
      descriptionSource: event.descriptionSource || 'fallback',
    };
  }
  return {
    ...event,
    elementDescription: isPendingRecorderDescription(event.elementDescription)
      ? undefined
      : event.elementDescription,
    descriptionLoading: true,
    descriptionSource: undefined,
    descriptionError: undefined,
  };
}

function createFallbackRecorderEvent(
  event: StudioRecordedEvent,
  error: unknown,
): StudioRecordedEvent {
  const message = error instanceof Error ? error.message : String(error);
  const pageContext = event.title || event.url;
  let elementDescription = event.elementDescription;
  if (!elementDescription || isPendingRecorderDescription(elementDescription)) {
    switch (event.type) {
      case 'scroll':
        elementDescription = pageContext || 'current visible page';
        break;
      case 'drag':
        elementDescription = pageContext
          ? `gesture area in ${pageContext}`
          : 'gesture area in the current visible UI';
        break;
      case 'input':
        elementDescription = pageContext
          ? `input field in ${pageContext}`
          : 'input field in the current visible UI';
        break;
      default:
        elementDescription = pageContext
          ? `target element in ${pageContext}`
          : 'target element in the current visible UI';
    }
  }
  const replayInstruction =
    event.replayInstruction ||
    (event.type === 'scroll'
      ? `Scroll the page/region with description "${elementDescription}" by value "${event.value || 'down'}".`
      : event.type === 'input'
        ? `Input "${event.value || ''}" into the element described as "${elementDescription}".`
        : event.type === 'drag'
          ? `Drag through the area described as "${elementDescription}".`
          : `Click on the element described as "${elementDescription}".`);
  const actionSummary =
    event.actionSummary || `${eventVerb(event)} ${elementDescription}`;
  return {
    ...event,
    elementDescription,
    replayInstruction,
    actionSummary,
    semanticConfidence: 'low',
    descriptionLoading: false,
    descriptionSource: 'fallback',
    descriptionError: message,
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: number | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  });
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

type RecorderDescriptionTask = {
  sessionId: string;
  event: StudioRecordedEvent;
};

type PendingRecorderInput = {
  sessionId: string;
  event: StudioRecordedEvent;
};

function isStudioPreviewInputEvent(event: StudioRecordedEvent) {
  return (
    event.source === 'studio-preview' &&
    event.type === 'input' &&
    event.actionType === 'Input'
  );
}

function hasRecorderElementRect(event: StudioRecordedEvent) {
  const rect = event.elementRect;
  if (!rect) {
    return false;
  }
  return ['left', 'top', 'width', 'height', 'x', 'y'].some(
    (key) => typeof rect[key as keyof typeof rect] === 'number',
  );
}

function recorderElementRectsMatch(
  current: StudioRecordedEvent,
  next: StudioRecordedEvent,
) {
  if (!hasRecorderElementRect(current) || !hasRecorderElementRect(next)) {
    return true;
  }
  const currentRect = current.elementRect || {};
  const nextRect = next.elementRect || {};
  return ['left', 'top', 'width', 'height', 'x', 'y'].every(
    (key) =>
      currentRect[key as keyof typeof currentRect] ===
      nextRect[key as keyof typeof nextRect],
  );
}

function canCoalesceRecorderInput(
  pending: PendingRecorderInput,
  sessionId: string,
  event: StudioRecordedEvent,
) {
  return (
    pending.sessionId === sessionId &&
    isStudioPreviewInputEvent(pending.event) &&
    isStudioPreviewInputEvent(event) &&
    createStudioRecorderTargetSignature(pending.event.target) ===
      createStudioRecorderTargetSignature(event.target) &&
    pending.event.url === event.url &&
    pending.event.title === event.title &&
    recorderElementRectsMatch(pending.event, event)
  );
}

function mergeRecorderInputEvents(
  current: StudioRecordedEvent,
  next: StudioRecordedEvent,
): StudioRecordedEvent {
  const value = `${current.value || ''}${next.value || ''}`;
  return {
    ...current,
    value,
    rawPayload: {
      ...current.rawPayload,
      ...next.rawPayload,
      value,
    },
    pageInfo: next.pageInfo || current.pageInfo,
    screenshotAfter: next.screenshotAfter || current.screenshotAfter,
    screenshotWithBox: next.screenshotWithBox || current.screenshotWithBox,
    timestamp: next.timestamp,
  };
}

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

function updateEvent(
  session: StudioRecordingSession,
  event: StudioRecordedEvent,
): StudioRecordingSession {
  let changed = false;
  const events = session.events.map((item) => {
    if (item.hashId !== event.hashId) {
      return item;
    }
    changed = true;
    return {
      ...item,
      ...event,
      platformId: item.platformId,
      target: item.target,
      actionType: event.actionType || item.actionType,
      rawPayload: event.rawPayload || item.rawPayload,
    };
  });
  if (!changed) {
    return session;
  }
  return {
    ...session,
    events,
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
  const pendingRecorderInputRef = useRef<PendingRecorderInput | null>(null);
  const descriptionQueueRef = useRef<RecorderDescriptionTask[]>([]);
  const descriptionInFlightRef = useRef(0);
  const descriptionIdleResolversRef = useRef<Set<() => void>>(new Set());
  const pendingDescriptionRetryKeysRef = useRef<Set<string>>(new Set());

  const notifyDescriptionIdle = useCallback(() => {
    if (
      descriptionQueueRef.current.length > 0 ||
      descriptionInFlightRef.current > 0
    ) {
      return;
    }
    const resolvers = Array.from(descriptionIdleResolversRef.current);
    descriptionIdleResolversRef.current.clear();
    for (const resolve of resolvers) {
      resolve();
    }
  }, []);

  const upsertSessionSnapshot = useCallback(
    async (session: StudioRecordingSession) => {
      const snapshot = stateRef.current;
      const sessionWithSummary = applyLocalSessionSummary(session);
      stateRef.current = upsertSessionInState(snapshot, sessionWithSummary);
      dispatch({ type: 'upsert-session', session: sessionWithSummary });
      await upsertStudioRecorderSession(sessionWithSummary);
      return sessionWithSummary;
    },
    [],
  );

  const updateRecordedEvent = useCallback(
    async (sessionId: string, event: StudioRecordedEvent) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session) {
        return null;
      }
      const updatedSession = updateEvent(session, event);
      if (updatedSession === session) {
        return session;
      }
      return upsertSessionSnapshot(updatedSession);
    },
    [upsertSessionSnapshot],
  );

  const describeRecorderEventsNow = useCallback(
    async (
      session: StudioRecordingSession,
      events: StudioRecordedEvent[],
    ): Promise<StudioRecordedEvent[]> => {
      if (events.length === 0) {
        return [];
      }
      const { describeStudioRecorderEventsWithAI } = await import('./codegen');
      const describedEvents = await describeStudioRecorderEventsWithAI(events, {
        target: session.target,
      });
      return describedEvents.map((event, index) => ({
        ...events[index],
        ...event,
        platformId: events[index].platformId,
        target: events[index].target,
        actionType: event.actionType || events[index].actionType,
        rawPayload: events[index].rawPayload,
      }));
    },
    [],
  );

  const processDescriptionQueue = useCallback(() => {
    while (
      descriptionInFlightRef.current < RECORDER_DESCRIPTION_CONCURRENCY &&
      descriptionQueueRef.current.length > 0
    ) {
      const task = descriptionQueueRef.current.shift();
      if (!task) {
        break;
      }
      descriptionInFlightRef.current += 1;
      void (async () => {
        try {
          const session = stateRef.current.sessions.find(
            (item) => item.id === task.sessionId,
          );
          if (!session) {
            return;
          }
          const [describedEvent] = await withTimeout(
            describeRecorderEventsNow(session, [task.event]),
            RECORDER_DESCRIPTION_TASK_TIMEOUT_MS,
            'Timed out while analyzing recorder event.',
          );
          if (describedEvent) {
            await updateRecordedEvent(task.sessionId, describedEvent);
          }
        } catch (error) {
          debugRecorder('failed to describe recorder event:', error);
          await updateRecordedEvent(
            task.sessionId,
            createFallbackRecorderEvent(task.event, error),
          );
        } finally {
          descriptionInFlightRef.current -= 1;
          notifyDescriptionIdle();
          processDescriptionQueue();
        }
      })();
    }
    notifyDescriptionIdle();
  }, [describeRecorderEventsNow, notifyDescriptionIdle, updateRecordedEvent]);

  const enqueueRecorderEventDescription = useCallback(
    (sessionId: string, event: StudioRecordedEvent) => {
      if (!shouldDescribeRecorderEvent(event)) {
        return;
      }
      descriptionQueueRef.current.push({ sessionId, event });
      processDescriptionQueue();
    },
    [processDescriptionQueue],
  );

  const persistRecordedEvent = useCallback(
    async (sessionId: string, event: StudioRecordedEvent) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!snapshot.isRecording || !session || !hasRecorderSession(session)) {
        return null;
      }

      const sessionWithEvent = upsertEvent(session, event);
      if (sessionWithEvent === session) {
        return session;
      }
      const updatedSession = applyLocalSessionSummary(sessionWithEvent);

      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      await upsertStudioRecorderSession(updatedSession);
      enqueueRecorderEventDescription(updatedSession.id, event);
      return updatedSession;
    },
    [enqueueRecorderEventDescription],
  );

  const flushPendingRecorderInput = useCallback(
    async (sessionId?: string) => {
      const pending = pendingRecorderInputRef.current;
      if (!pending || (sessionId && pending.sessionId !== sessionId)) {
        return null;
      }

      pendingRecorderInputRef.current = null;
      return persistRecordedEvent(pending.sessionId, pending.event);
    },
    [persistRecordedEvent],
  );

  const markPendingDescriptionsAsFallback = useCallback(
    async (sessionId: string, reason: string) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session) {
        return null;
      }

      let updatedSession = session;
      for (const event of session.events) {
        if (event.descriptionLoading) {
          updatedSession = updateEvent(
            updatedSession,
            createFallbackRecorderEvent(event, new Error(reason)),
          );
        }
      }

      if (updatedSession === session) {
        return session;
      }
      return upsertSessionSnapshot(updatedSession);
    },
    [upsertSessionSnapshot],
  );

  const waitForRecorderEventDescriptions = useCallback(
    async (timeoutMs = RECORDER_DESCRIPTION_IDLE_TIMEOUT_MS) => {
      await flushPendingRecorderInput();
      if (
        descriptionQueueRef.current.length === 0 &&
        descriptionInFlightRef.current === 0
      ) {
        return true;
      }
      let timeout: number | null = null;
      let idleResolver: (() => void) | null = null;
      let settled = false;
      await Promise.race([
        new Promise<void>((resolve) => {
          idleResolver = () => {
            settled = true;
            resolve();
          };
          descriptionIdleResolversRef.current.add(idleResolver);
        }),
        new Promise<void>((resolve) => {
          timeout = window.setTimeout(resolve, timeoutMs);
        }),
      ]);
      if (timeout) {
        window.clearTimeout(timeout);
      }
      if (idleResolver) {
        descriptionIdleResolversRef.current.delete(idleResolver);
      }
      return settled;
    },
    [flushPendingRecorderInput],
  );

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

  const generateSessionMetadata = useCallback(
    async (session: StudioRecordingSession) => {
      if (session.events.length === 0 || session.metadataGeneratedAt) {
        return session;
      }

      const localSummarySession = applyLocalSessionSummary(session);
      if (localSummarySession !== session) {
        await upsertSessionSnapshot(localSummarySession);
      }

      try {
        const { generateStudioRecorderMetadataWithAI } = await import(
          './codegen'
        );
        const metadata =
          await generateStudioRecorderMetadataWithAI(localSummarySession);
        if (!metadata.title && !metadata.description) {
          return localSummarySession;
        }
        const updatedSession: StudioRecordingSession = {
          ...localSummarySession,
          name: metadata.title || localSummarySession.name,
          description: metadata.description || localSummarySession.description,
          metadataGeneratedAt: Date.now(),
          updatedAt: Date.now(),
        };
        return upsertSessionSnapshot(updatedSession);
      } catch (error) {
        debugRecorder('failed to generate recorder session metadata:', error);
        return localSummarySession;
      }
    },
    [upsertSessionSnapshot],
  );

  const describeUndescribedSessionEvents = useCallback(
    async (session: StudioRecordingSession) => {
      await flushPendingRecorderInput(session.id);
      const latestSession =
        stateRef.current.sessions.find((item) => item.id === session.id) ??
        session;
      const candidates = latestSession.events.filter(
        (event) =>
          shouldDescribeRecorderEvent(event) &&
          (event.descriptionLoading || event.descriptionSource !== 'ai'),
      );
      if (candidates.length === 0) {
        return latestSession;
      }

      let describedEvents: StudioRecordedEvent[];
      try {
        describedEvents = await describeRecorderEventsNow(
          latestSession,
          candidates,
        );
      } catch (error) {
        debugRecorder('failed to retry recorder event descriptions:', error);
        describedEvents = candidates.map((event) =>
          createFallbackRecorderEvent(event, error),
        );
      }

      let updatedSession = latestSession;
      for (const event of describedEvents) {
        updatedSession = updateEvent(updatedSession, event);
      }
      if (updatedSession === latestSession) {
        return latestSession;
      }
      return upsertSessionSnapshot(updatedSession);
    },
    [
      describeRecorderEventsNow,
      flushPendingRecorderInput,
      upsertSessionSnapshot,
    ],
  );

  useEffect(() => {
    if (!currentSession || currentSession.status === 'recording') {
      return;
    }

    const pendingEvents = currentSession.events.filter(
      (event) => shouldDescribeRecorderEvent(event) && event.descriptionLoading,
    );
    if (pendingEvents.length === 0) {
      return;
    }

    const retryKey = `${currentSession.id}:${pendingEvents
      .map((event) => event.hashId)
      .join(',')}`;
    if (pendingDescriptionRetryKeysRef.current.has(retryKey)) {
      return;
    }
    pendingDescriptionRetryKeysRef.current.add(retryKey);

    void (async () => {
      try {
        await withTimeout(
          describeUndescribedSessionEvents(currentSession),
          RECORDER_DESCRIPTION_TASK_TIMEOUT_MS,
          'Timed out while analyzing recorder events.',
        );
      } catch (error) {
        let updatedSession = currentSession;
        for (const event of pendingEvents) {
          updatedSession = updateEvent(
            updatedSession,
            createFallbackRecorderEvent(event, error),
          );
        }
        if (updatedSession !== currentSession) {
          await upsertSessionSnapshot(updatedSession);
        }
      }
    })();
  }, [currentSession, describeUndescribedSessionEvents, upsertSessionSnapshot]);

  const stopRecording = useCallback(async () => {
    const snapshot = stateRef.current;
    const session = snapshot.sessions.find(
      (item) => item.id === snapshot.currentSessionId,
    );
    if (!snapshot.isRecording || !session) {
      return;
    }

    await stopRecorderRuntime(session.id);
    const descriptionsSettled = await waitForRecorderEventDescriptions();
    if (!descriptionsSettled) {
      await markPendingDescriptionsAsFallback(
        session.id,
        'Timed out while analyzing recorder events.',
      );
    }
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
    await generateSessionMetadata(updatedSession);
  }, [
    generateSessionMetadata,
    markPendingDescriptionsAsFallback,
    stopRecorderRuntime,
    waitForRecorderEventDescriptions,
  ]);

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
      await flushPendingRecorderInput(sessionId);
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

      const descriptionsSettled = await waitForRecorderEventDescriptions();
      if (!descriptionsSettled) {
        await markPendingDescriptionsAsFallback(
          session.id,
          'Timed out while analyzing recorder events.',
        );
      }
      const latestSessionForCodegen =
        stateRef.current.sessions.find((item) => item.id === session.id) ??
        session;
      let sessionForCodegen = await describeUndescribedSessionEvents(
        latestSessionForCodegen,
      );

      options.onProgress?.({
        step: 'prepare',
        status: 'completed',
        details: `Prepared ${sessionForCodegen.events.length} recorded events`,
      });

      const {
        generateStudioRecorderCodeWithAI,
        generateStudioRecorderMetadataWithAI,
      } = await import('./codegen');
      if (!sessionForCodegen.metadataGeneratedAt) {
        try {
          options.onProgress?.({
            step: 'metadata',
            status: 'loading',
            details: 'Analyzing session content...',
          });
          const metadata =
            await generateStudioRecorderMetadataWithAI(sessionForCodegen);
          if (metadata.title || metadata.description) {
            sessionForCodegen = {
              ...sessionForCodegen,
              name: metadata.title || sessionForCodegen.name,
              description:
                metadata.description || sessionForCodegen.description,
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
    [
      describeUndescribedSessionEvents,
      flushPendingRecorderInput,
      markPendingDescriptionsAsFallback,
      waitForRecorderEventDescriptions,
    ],
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

      const studioEvent = mapPreviewRecorderEventToStudioRecordedEvent({
        event,
        target: session.target,
      });
      const pendingEvent = createPendingRecorderEvent(studioEvent);

      if (isStudioPreviewInputEvent(pendingEvent)) {
        const pending = pendingRecorderInputRef.current;
        if (
          pending &&
          canCoalesceRecorderInput(pending, session.id, pendingEvent)
        ) {
          pendingRecorderInputRef.current = {
            sessionId: session.id,
            event: mergeRecorderInputEvents(pending.event, pendingEvent),
          };
          return;
        }
        await flushPendingRecorderInput();
        pendingRecorderInputRef.current = {
          sessionId: session.id,
          event: pendingEvent,
        };
        return;
      }

      await flushPendingRecorderInput();
      await persistRecordedEvent(session.id, pendingEvent);
    },
    [flushPendingRecorderInput, persistRecordedEvent],
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

    const startPreviewRecorder = async () => {
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
          result.error ||
          'Current target does not expose preview interaction controls.';
        debugRecorder('preview recorder unavailable: %s', error);
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

    void startPreviewRecorder();

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

  const exportSessionJson = useCallback(
    async (sessionId: string) => {
      await flushPendingRecorderInput(sessionId);
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session) {
        return;
      }
      await saveStudioRecorderFile({
        title: 'Export Recorder JSON',
        defaultFileName: getStudioRecorderExportVariantFileName(
          session,
          'json',
          'json',
        ),
        filters: [{ name: 'JSON', extensions: ['json'] }],
        content: generateStudioRecorderJson(session),
      });
    },
    [flushPendingRecorderInput],
  );

  const exportSessionYaml = useCallback(
    async (sessionId: string) => {
      await flushPendingRecorderInput(sessionId);
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session) {
        return;
      }
      const usesFallback = !session.generatedCode?.yaml;
      await saveStudioRecorderFile({
        title: 'Export Recorder YAML',
        defaultFileName: getStudioRecorderExportVariantFileName(
          session,
          'yaml',
          'yaml',
        ),
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
        content:
          session.generatedCode?.yaml || generateStudioRecorderYaml(session),
      });
      if (usesFallback) {
        message.info(
          'Downloaded fallback YAML generated from recorded events, not AI YAML.',
        );
      }
    },
    [flushPendingRecorderInput],
  );

  const exportSessionCode = useCallback(
    async (sessionId: string, type: StudioRecorderCodeType) => {
      await flushPendingRecorderInput(sessionId);
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
        if (!session.generatedCode?.markdown) {
          throw new Error('Generate AI Markdown before downloading.');
        }
        await saveStudioRecorderFile({
          title: 'Export Recorder Markdown Replay',
          defaultFileName: getStudioRecorderExportVariantFileName(
            session,
            'markdown',
            'zip',
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
        defaultFileName: getStudioRecorderExportVariantFileName(
          session,
          'playwright',
          'spec.ts',
        ),
        filters: [{ name: 'Playwright Test', extensions: ['ts'] }],
        content: playwright,
      });
    },
    [exportSessionYaml, flushPendingRecorderInput],
  );

  const exportAllZip = useCallback(async () => {
    await flushPendingRecorderInput();
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
  }, [flushPendingRecorderInput]);

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
