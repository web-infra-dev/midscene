import type {
  PlaygroundPageRecordedEvent,
  PlaygroundRecorderDescribeResult,
  PlaygroundRecorderFinalization,
  PlaygroundRecorderStopResult,
} from '@midscene/playground';
import { getDebug } from '@midscene/shared/logger';
import type { MidsceneRecorderSemanticAction } from '@midscene/shared/recorder';
import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  buildMidsceneRecorderActionSummary,
  buildMidsceneRecorderReplayInstruction,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import { App as AntdApp } from 'antd';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useStudioPlayground } from '../playground/useStudioPlayground';
import {
  describeStudioRecorderEventsWithAI,
  generateStudioRecorderCodeWithAI,
  generateStudioRecorderMetadataWithAI,
} from './codegen';
import { mapPreviewRecorderEventToStudioRecordedEvent } from './event-mapper';
import {
  createStudioRecorderArchivePlan,
  createStudioRecorderMarkdownArchivePlan,
  createStudioRecorderMarkdownZipBase64,
  createStudioRecorderZipBase64,
  generateStudioRecorderJson,
  generateStudioRecorderPlaywright,
  generateStudioRecorderYaml,
  getStudioRecorderExportVariantFileName,
  materializeStudioRecorderSessionScreenshots,
  saveStudioRecorderArchive,
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
const RECORDER_AI_DESCRIBE_TASK_TIMEOUT_MS = 32_000;
const RECORDER_AI_FALLBACK_TASK_TIMEOUT_MS = 25_000;
const RECORDER_DESCRIPTION_STAGE_BUFFER_MS = 3_000;
const RECORDER_DESCRIPTION_TASK_TIMEOUT_MS =
  RECORDER_AI_DESCRIBE_TASK_TIMEOUT_MS +
  RECORDER_AI_FALLBACK_TASK_TIMEOUT_MS +
  RECORDER_DESCRIPTION_STAGE_BUFFER_MS;
const RECORDER_DESCRIPTION_IDLE_SETTLE_BUFFER_MS = 1000;
const RECORDER_SESSION_CHECKPOINT_DEBOUNCE_MS = 100;

type StudioRecorderAction =
  | {
      type: 'initialize';
      sessions: StudioRecordingSession[];
      currentSessionId: string | null;
    }
  | { type: 'upsert-session'; session: StudioRecordingSession }
  | { type: 'delete-session'; sessionId: string }
  | { type: 'discard-draft-sessions' }
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
  const sessionIsActive =
    session.status === 'recording' || session.status === 'finalizing';
  return {
    ...state,
    sessions,
    currentSessionId: sessionIsActive
      ? session.id
      : (state.currentSessionId ?? session.id),
    isRecording: sessionIsActive || state.isRecording,
    error: null,
  };
}

function isReplayableRecorderSession(session: StudioRecordingSession) {
  return Boolean(session.generatedCode?.markdown);
}

function discardDraftSessions(state: StudioRecorderState): StudioRecorderState {
  const sessions = state.sessions.filter(isReplayableRecorderSession);
  return {
    ...state,
    sessions,
    currentSessionId: sessions.some(
      (session) => session.id === state.currentSessionId,
    )
      ? state.currentSessionId
      : (sessions[0]?.id ?? null),
    isRecording: false,
  };
}

function reducer(
  state: StudioRecorderState,
  action: StudioRecorderAction,
): StudioRecorderState {
  switch (action.type) {
    case 'initialize': {
      const draftSessions = state.sessions.filter(
        (session) => !isReplayableRecorderSession(session),
      );
      const sessions = [
        ...draftSessions,
        ...action.sessions.filter(
          (session) => !draftSessions.some((draft) => draft.id === session.id),
        ),
      ].sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        ...state,
        initialized: true,
        initializing: false,
        sessions,
        currentSessionId:
          state.currentSessionId &&
          sessions.some((session) => session.id === state.currentSessionId)
            ? state.currentSessionId
            : action.currentSessionId &&
                sessions.some(
                  (session) => session.id === action.currentSessionId,
                )
              ? action.currentSessionId
              : (sessions[0]?.id ?? null),
        isRecording: state.isRecording,
      };
    }
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
    case 'discard-draft-sessions':
      return discardDraftSessions(state);
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

function hasUnresolvedRecorderSemantic(
  semantic: ReturnType<typeof getMidsceneRecorderSemantic>,
) {
  return Boolean(
    semantic?.status === 'pending' ||
      isPendingRecorderDescription(semantic?.elementDescription) ||
      isPendingRecorderDescription(semantic?.actionSummary) ||
      isPendingRecorderDescription(semantic?.replayInstruction),
  );
}

function buildRecorderSemanticAction(
  event: StudioRecordedEvent,
): MidsceneRecorderSemanticAction {
  return {
    type: event.type,
    actionType: event.actionType,
    value: event.value,
    url: event.url,
  };
}

function isImplicitNavigationRecorderState(event: StudioRecordedEvent) {
  if (event.source !== 'studio-preview' || event.type !== 'navigation') {
    return false;
  }
  if (event.actionType === 'NavigationChanged') {
    return true;
  }
  return (
    event.rawPayload.implicitNavigationState === true ||
    typeof event.rawPayload.triggerActionType === 'string'
  );
}

function excludeImplicitNavigationStatesFromCodegen(
  session: StudioRecordingSession,
): StudioRecordingSession {
  const events = session.events.filter(
    (event) => !isImplicitNavigationRecorderState(event),
  );
  return events.length === session.events.length
    ? session
    : { ...session, events };
}

function isReadyRecorderSemanticWithDescription(
  semantic: ReturnType<typeof getMidsceneRecorderSemantic>,
) {
  return Boolean(
    semantic?.status === 'ready' &&
      semantic.elementDescription &&
      !isPendingRecorderDescription(semantic.elementDescription),
  );
}

function mergePreferredRecorderSemantic(
  current: ReturnType<typeof getMidsceneRecorderSemantic>,
  next: ReturnType<typeof getMidsceneRecorderSemantic>,
) {
  if (!next) {
    return current;
  }
  if (
    isReadyRecorderSemanticWithDescription(current) &&
    !isReadyRecorderSemanticWithDescription(next)
  ) {
    return current;
  }
  return next;
}

function normalizeInputRecorderSemantic(
  event: StudioRecordedEvent,
): StudioRecordedEvent {
  const semantic = getMidsceneRecorderSemantic(event);
  if (
    event.type !== 'input' ||
    !semantic?.elementDescription ||
    semantic.status !== 'ready'
  ) {
    return event;
  }

  const semanticAction = buildRecorderSemanticAction(event);
  return {
    ...event,
    semantic: {
      ...semantic,
      replayInstruction: buildMidsceneRecorderReplayInstruction(
        semanticAction,
        semantic.elementDescription,
      ),
      actionSummary: buildMidsceneRecorderActionSummary(
        semanticAction,
        semantic.elementDescription,
      ),
    },
  };
}

function getSemanticEventDescription(event: StudioRecordedEvent) {
  const description = getMidsceneRecorderEventDescription(event);
  if (isCoordinateDescription(description)) {
    return '';
  }
  return description;
}

function createLocalSessionSummary(events: StudioRecordedEvent[]) {
  const descriptions = events
    .filter((event) => getMidsceneRecorderSemantic(event)?.status === 'ready')
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
    if (getMidsceneRecorderSemantic(event)?.status !== 'ready') {
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

function getRecorderEventTimestamp(event: StudioRecordedEvent) {
  if (typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)) {
    return event.timestamp;
  }
  const hashTimestamp = event.hashId?.match(/-(\d{10,})-/)?.[1];
  if (!hashTimestamp) {
    return undefined;
  }
  const timestamp = Number(hashTimestamp);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sortRecorderEventsByTimestamp(events: StudioRecordedEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const leftSequence = left.event.sequence;
      const rightSequence = right.event.sequence;
      if (
        typeof leftSequence === 'number' &&
        Number.isFinite(leftSequence) &&
        typeof rightSequence === 'number' &&
        Number.isFinite(rightSequence)
      ) {
        const sequenceOrder = leftSequence - rightSequence;
        if (sequenceOrder !== 0) {
          return sequenceOrder;
        }
        const derivedEventOrder =
          Number(Boolean(left.event.parentEventId)) -
          Number(Boolean(right.event.parentEventId));
        if (derivedEventOrder !== 0) {
          return derivedEventOrder;
        }
      }
      const leftTimestamp = getRecorderEventTimestamp(left.event);
      const rightTimestamp = getRecorderEventTimestamp(right.event);
      if (leftTimestamp !== undefined && rightTimestamp !== undefined) {
        return leftTimestamp - rightTimestamp || left.index - right.index;
      }
      if (leftTimestamp !== undefined) {
        return -1;
      }
      if (rightTimestamp !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function isRecorderEventBefore(
  current: StudioRecordedEvent,
  next: StudioRecordedEvent,
) {
  if (
    typeof current.sequence === 'number' &&
    Number.isFinite(current.sequence) &&
    typeof next.sequence === 'number' &&
    Number.isFinite(next.sequence)
  ) {
    return current.sequence < next.sequence;
  }
  const currentTimestamp = getRecorderEventTimestamp(current);
  const nextTimestamp = getRecorderEventTimestamp(next);
  return (
    currentTimestamp !== undefined &&
    nextTimestamp !== undefined &&
    currentTimestamp < nextTimestamp
  );
}

function normalizeSessionEventOrder(
  session: StudioRecordingSession,
): StudioRecordingSession {
  const normalizedEvents = mergeAdjacentRecorderInputEvents(
    sortRecorderEventsByTimestamp(session.events),
  );
  if (
    normalizedEvents.every((event, index) => event === session.events[index])
  ) {
    return session;
  }
  return {
    ...session,
    events: normalizedEvents,
  };
}

function shouldDescribeRecorderEvent(event: StudioRecordedEvent) {
  if (event.source !== 'studio-preview') {
    return false;
  }
  if (event.type === 'navigation' || event.type === 'setViewport') {
    return false;
  }
  const semantic = getMidsceneRecorderSemantic(event);
  if (
    semantic?.status === 'ready' &&
    !hasUnresolvedRecorderSemantic(semantic)
  ) {
    return false;
  }
  return Boolean(
    event.screenshotAsset || event.screenshotBefore || event.screenshotAfter,
  );
}

function createPendingRecorderEvent(
  event: StudioRecordedEvent,
): StudioRecordedEvent {
  if (!shouldDescribeRecorderEvent(event)) {
    return event;
  }
  const semantic = getMidsceneRecorderSemantic(event);
  return {
    ...event,
    semantic: semantic
      ? {
          ...semantic,
          status: semantic.status === 'failed' ? 'failed' : 'pending',
          elementDescription:
            semantic.elementDescription &&
            !isPendingRecorderDescription(semantic.elementDescription)
              ? semantic.elementDescription
              : undefined,
        }
      : {
          source: 'recorderAI',
          status: 'pending',
        },
  };
}

function createFallbackRecorderEvent(
  event: StudioRecordedEvent,
  error: unknown,
): StudioRecordedEvent {
  const message = error instanceof Error ? error.message : String(error);
  const pageContext = event.title || event.url;
  const semantic = getMidsceneRecorderSemantic(event);
  let elementDescription = semantic?.elementDescription;
  if (!elementDescription || isPendingRecorderDescription(elementDescription)) {
    switch (event.type) {
      case 'scroll':
        elementDescription = createFallbackScrollDescription(event);
        break;
      case 'drag':
        elementDescription = pageContext
          ? `gesture area in ${pageContext}`
          : 'gesture area in the current visible UI';
        break;
      case 'input':
        elementDescription = 'unresolved input field in the current visible UI';
        break;
      default:
        elementDescription = pageContext
          ? `target element in ${pageContext}`
          : 'target element in the current visible UI';
    }
  }
  const semanticAction = buildRecorderSemanticAction(event);
  return {
    ...event,
    semantic: {
      source: 'heuristic',
      status: 'ready',
      elementDescription,
      replayInstruction: buildMidsceneRecorderReplayInstruction(
        semanticAction,
        elementDescription,
      ),
      actionSummary: buildMidsceneRecorderActionSummary(
        semanticAction,
        elementDescription,
      ),
      confidence: 'low',
      error: message,
    },
  };
}

function createFallbackScrollDescription(event: StudioRecordedEvent) {
  const pageContext = event.title || event.url || 'current visible page';
  const scrollValue = event.value?.trim();
  const point =
    typeof event.elementRect?.x === 'number' &&
    typeof event.elementRect?.y === 'number'
      ? ` near point (${Math.round(event.elementRect.x)}, ${Math.round(
          event.elementRect.y,
        )})`
      : '';
  return scrollValue
    ? `${pageContext}${point}, scroll ${scrollValue}`
    : `${pageContext}${point}`;
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

function calculateRecorderDescriptionQueueTimeoutMs(eventCount: number) {
  const descriptionBatches = Math.max(
    1,
    Math.ceil(eventCount / RECORDER_DESCRIPTION_CONCURRENCY),
  );
  return (
    descriptionBatches * RECORDER_DESCRIPTION_TASK_TIMEOUT_MS +
    RECORDER_DESCRIPTION_IDLE_SETTLE_BUFFER_MS
  );
}

type StudioRecorderRuntime = {
  sessionId: string;
  logCursor: number;
  stopping: boolean;
  stopPromise?: Promise<void>;
  finalization?: PlaygroundRecorderFinalization;
  preserveUntilExplicitClear?: boolean;
  drainAgain?: boolean;
  drainPromise?: Promise<void>;
  getRecorderEvents: (afterLogSequence?: number) => Promise<{
    events: PlaygroundPageRecordedEvent[];
    nextLogSequence?: number;
    nextIndex?: number;
    finalization?: PlaygroundRecorderFinalization;
  }>;
  describeRecorderEventAtPoint?: (
    event: StudioRecordedEvent,
  ) => Promise<PlaygroundRecorderDescribeResult>;
  stopRecorderSession?: () => Promise<PlaygroundRecorderStopResult>;
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

function isTypeOnlyRecorderInput(event: StudioRecordedEvent) {
  return event.rawPayload.mode === 'typeOnly';
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
    return false;
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
    canMergeAdjacentRecorderInputEvents(pending.event, event)
  );
}

function canMergeAdjacentRecorderInputEvents(
  current: StudioRecordedEvent,
  next: StudioRecordedEvent,
) {
  return (
    isStudioPreviewInputEvent(current) &&
    isStudioPreviewInputEvent(next) &&
    isTypeOnlyRecorderInput(current) &&
    isTypeOnlyRecorderInput(next) &&
    !current.screenshotAsset &&
    !next.screenshotAsset &&
    createStudioRecorderTargetSignature(current.target) ===
      createStudioRecorderTargetSignature(next.target) &&
    current.url === next.url &&
    current.title === next.title
  );
}

function getRecorderEventHashLineage(event: StudioRecordedEvent) {
  return Array.from(
    new Set([event.hashId, ...(event.mergedHashIds || [])].filter(Boolean)),
  );
}

function recorderEventHashMatches(
  event: StudioRecordedEvent | undefined,
  hashId?: string,
) {
  return Boolean(
    hashId &&
      event &&
      (event.hashId === hashId || event.mergedHashIds?.includes(hashId)),
  );
}

function findSessionEventByHashLineage(
  session: StudioRecordingSession,
  event: StudioRecordedEvent,
) {
  const hashIds = getRecorderEventHashLineage(event);
  return session.events.find((item) =>
    hashIds.some((hashId) => recorderEventHashMatches(item, hashId)),
  );
}

function mergeRecorderEventHashLineage(
  ...events: StudioRecordedEvent[]
): string[] {
  return Array.from(
    new Set(events.flatMap((event) => getRecorderEventHashLineage(event))),
  );
}

function normalizeRecorderEventMergedHashIds(hashIds: string[]) {
  return hashIds.length > 1 ? hashIds : undefined;
}

function mergeRecorderInputEvents(
  current: StudioRecordedEvent,
  next: StudioRecordedEvent,
): StudioRecordedEvent {
  const value = `${current.value || ''}${next.value || ''}`;
  const merged = {
    ...current,
    value,
    rawPayload: {
      ...current.rawPayload,
      ...next.rawPayload,
      value,
    },
    pageInfo: next.pageInfo || current.pageInfo,
    screenshotAsset: next.screenshotAsset || current.screenshotAsset,
    screenshotAfter: next.screenshotAfter || current.screenshotAfter,
    screenshotWithBox: next.screenshotWithBox || current.screenshotWithBox,
    timestamp: next.timestamp,
    mergedHashIds: normalizeRecorderEventMergedHashIds(
      mergeRecorderEventHashLineage(current, next),
    ),
  };
  const semantic = mergePreferredRecorderSemantic(
    getMidsceneRecorderSemantic(current),
    getMidsceneRecorderSemantic(next),
  );
  if (!semantic?.elementDescription) {
    return merged;
  }
  const semanticAction = buildRecorderSemanticAction(merged);
  return {
    ...merged,
    semantic: {
      ...semantic,
      replayInstruction: buildMidsceneRecorderReplayInstruction(
        semanticAction,
        semantic.elementDescription,
      ),
      actionSummary: buildMidsceneRecorderActionSummary(
        semanticAction,
        semantic.elementDescription,
      ),
    },
  };
}

function mergeAdjacentRecorderInputEvents(events: StudioRecordedEvent[]) {
  const mergedEvents: StudioRecordedEvent[] = [];
  for (const event of events) {
    const previous = mergedEvents.at(-1);
    if (previous && canMergeAdjacentRecorderInputEvents(previous, event)) {
      mergedEvents[mergedEvents.length - 1] = mergeRecorderInputEvents(
        previous,
        event,
      );
      continue;
    }
    mergedEvents.push(event);
  }
  return mergedEvents;
}

function upsertEvent(
  session: StudioRecordingSession,
  event: StudioRecordedEvent,
): StudioRecordingSession {
  if (
    session.events.some((item) => recorderEventHashMatches(item, event.hashId))
  ) {
    return updateEvent(session, event);
  }

  return {
    ...session,
    events: mergeAdjacentRecorderInputEvents(
      sortRecorderEventsByTimestamp([...session.events, event]),
    ),
    updatedAt: Date.now(),
  };
}

function updateEvent(
  session: StudioRecordingSession,
  event: StudioRecordedEvent,
): StudioRecordingSession {
  let changed = false;
  const events = session.events.map((item) => {
    if (!recorderEventHashMatches(item, event.hashId)) {
      return item;
    }
    changed = true;
    const shouldPreserveRecorderValue =
      item.type === 'input' || item.type === 'keydown';
    const mergedHashIds = normalizeRecorderEventMergedHashIds(
      mergeRecorderEventHashLineage(item, event),
    );
    const mergedEvent = {
      ...item,
      ...event,
      hashId: item.hashId,
      mergedHashIds,
      timestamp: item.timestamp,
      platformId: item.platformId,
      target: item.target,
      value: shouldPreserveRecorderValue ? item.value : event.value,
      actionType: event.actionType || item.actionType,
      rawPayload: shouldPreserveRecorderValue
        ? item.rawPayload
        : event.rawPayload || item.rawPayload,
      semantic: mergePreferredRecorderSemantic(
        getMidsceneRecorderSemantic(item),
        getMidsceneRecorderSemantic(event),
      ),
    };
    return normalizeInputRecorderSemantic(mergedEvent);
  });
  if (!changed) {
    return session;
  }
  return {
    ...session,
    events: mergeAdjacentRecorderInputEvents(
      sortRecorderEventsByTimestamp(events),
    ),
    updatedAt: Date.now(),
  };
}

function hasRecorderSession(session: StudioRecordingSession | null): boolean {
  return session !== null;
}

export function StudioRecorderProvider({ children }: PropsWithChildren) {
  const { message } = AntdApp.useApp();
  const studioPlayground = useStudioPlayground();
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const currentTarget = useMemo(
    () => selectStudioRecorderTarget(studioPlayground),
    [studioPlayground],
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
    (sessionId: string, event: PlaygroundPageRecordedEvent) => Promise<void>
  >(async () => undefined);
  const recordPageEventsRef = useRef<
    (sessionId: string, events: PlaygroundPageRecordedEvent[]) => Promise<void>
  >(async () => undefined);
  const recorderRuntimeRef = useRef<StudioRecorderRuntime | null>(null);
  const pendingRecorderInputRef = useRef<PendingRecorderInput | null>(null);
  const descriptionQueueRef = useRef<RecorderDescriptionTask[]>([]);
  const descriptionInFlightRef = useRef(0);
  const descriptionIdleResolversRef = useRef<Set<() => void>>(new Set());
  const pendingDescriptionRetryKeysRef = useRef<Set<string>>(new Set());
  const pendingSessionCheckpointsRef = useRef<
    Map<string, StudioRecordingSession>
  >(new Map());
  const sessionCheckpointTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const sessionCheckpointFlushPromiseRef = useRef<Promise<void> | null>(null);

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

  const clearRecorderScreenshotAssets = useCallback(
    async (sessionId: string) => {
      if (studioPlayground.phase !== 'ready') {
        return;
      }
      try {
        await studioPlayground.controller.state.playgroundSDK.clearRecorderScreenshotAssets(
          sessionId,
        );
      } catch (error) {
        debugRecorder('failed to remove recorder screenshot assets:', error);
      }
    },
    [studioPlayground],
  );

  const persistStudioRecorderSessionImmediately = useCallback(
    async (session: StudioRecordingSession) => {
      const trimmedSessionIds = await upsertStudioRecorderSession(session);
      await Promise.all(
        trimmedSessionIds.map((sessionId) =>
          clearRecorderScreenshotAssets(sessionId),
        ),
      );
      for (const sessionId of trimmedSessionIds) {
        stateRef.current = reducer(stateRef.current, {
          type: 'delete-session',
          sessionId,
        });
        dispatch({ type: 'delete-session', sessionId });
      }
    },
    [clearRecorderScreenshotAssets],
  );

  const flushStudioRecorderSessionCheckpoints = useCallback(async () => {
    if (sessionCheckpointTimerRef.current) {
      clearTimeout(sessionCheckpointTimerRef.current);
      sessionCheckpointTimerRef.current = null;
    }
    if (sessionCheckpointFlushPromiseRef.current) {
      await sessionCheckpointFlushPromiseRef.current;
    }
    while (pendingSessionCheckpointsRef.current.size > 0) {
      const checkpoints = Array.from(
        pendingSessionCheckpointsRef.current.values(),
      );
      pendingSessionCheckpointsRef.current.clear();
      const flushPromise = (async () => {
        for (const session of checkpoints) {
          await persistStudioRecorderSessionImmediately(session);
        }
      })();
      sessionCheckpointFlushPromiseRef.current = flushPromise;
      try {
        await flushPromise;
      } finally {
        if (sessionCheckpointFlushPromiseRef.current === flushPromise) {
          sessionCheckpointFlushPromiseRef.current = null;
        }
      }
    }
  }, [persistStudioRecorderSessionImmediately]);

  const scheduleStudioRecorderSessionCheckpoint = useCallback(
    (session: StudioRecordingSession) => {
      pendingSessionCheckpointsRef.current.set(session.id, session);
      if (sessionCheckpointTimerRef.current) {
        return;
      }
      sessionCheckpointTimerRef.current = setTimeout(() => {
        sessionCheckpointTimerRef.current = null;
        void flushStudioRecorderSessionCheckpoints().catch((error) => {
          debugRecorder('failed to checkpoint recorder session:', error);
        });
      }, RECORDER_SESSION_CHECKPOINT_DEBOUNCE_MS);
    },
    [flushStudioRecorderSessionCheckpoints],
  );

  const persistStudioRecorderSession = useCallback(
    async (session: StudioRecordingSession) => {
      pendingSessionCheckpointsRef.current.set(session.id, session);
      await flushStudioRecorderSessionCheckpoints();
    },
    [flushStudioRecorderSessionCheckpoints],
  );

  const upsertSessionSnapshot = useCallback(
    async (session: StudioRecordingSession) => {
      const snapshot = stateRef.current;
      const sessionWithSummary = applyLocalSessionSummary(session);
      stateRef.current = upsertSessionInState(snapshot, sessionWithSummary);
      dispatch({ type: 'upsert-session', session: sessionWithSummary });
      await persistStudioRecorderSession(sessionWithSummary);
      return sessionWithSummary;
    },
    [persistStudioRecorderSession],
  );

  const checkpointSessionSnapshot = useCallback(
    (session: StudioRecordingSession) => {
      const snapshot = stateRef.current;
      const sessionWithSummary = applyLocalSessionSummary(session);
      stateRef.current = upsertSessionInState(snapshot, sessionWithSummary);
      dispatch({ type: 'upsert-session', session: sessionWithSummary });
      scheduleStudioRecorderSessionCheckpoint(sessionWithSummary);
      return sessionWithSummary;
    },
    [scheduleStudioRecorderSessionCheckpoint],
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
      return checkpointSessionSnapshot(updatedSession);
    },
    [checkpointSessionSnapshot],
  );

  const describeRecorderEventWithAiDescribe = useCallback(
    async (
      sessionId: string,
      event: StudioRecordedEvent,
    ): Promise<StudioRecordedEvent | null> => {
      if (event.type === 'scroll') {
        return null;
      }
      const runtime = recorderRuntimeRef.current;
      if (
        !runtime ||
        runtime.sessionId !== sessionId ||
        typeof runtime.describeRecorderEventAtPoint !== 'function'
      ) {
        return null;
      }
      let result: PlaygroundRecorderDescribeResult;
      try {
        result = await withTimeout(
          runtime.describeRecorderEventAtPoint(event),
          RECORDER_AI_DESCRIBE_TASK_TIMEOUT_MS,
          'Timed out while analyzing recorder event with aiDescribe.',
        );
      } catch (error) {
        return {
          ...event,
          semantic: {
            source: 'aiDescribe',
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
      if (result.trace) {
        debugRecorder('recorder aiDescribe trace:', result.trace);
      }
      if (!result.ok) {
        const aiDescribe =
          result.trace?.verifyResult || result.trace?.annotatedScreenshotRef
            ? {
                verifyPrompt: result.trace.verifyPrompt ?? false,
                verifyPassed: result.trace.verifyPassed,
                centerDistance: result.trace.centerDistance,
                expectedCenter: result.trace.point,
                actualCenter: result.trace.verifyResult?.center,
                annotatedScreenshotPath:
                  result.trace.annotatedScreenshotRef?.path,
              }
            : undefined;
        const elementDescription = result.trace?.elementDescription?.trim();
        if (elementDescription && result.trace?.verifyPassed === false) {
          const semanticAction = buildRecorderSemanticAction(event);
          return normalizeInputRecorderSemantic({
            ...event,
            semantic: {
              source: 'aiDescribe',
              status: 'ready',
              elementDescription,
              replayInstruction: buildMidsceneRecorderReplayInstruction(
                semanticAction,
                elementDescription,
              ),
              actionSummary: buildMidsceneRecorderActionSummary(
                semanticAction,
                elementDescription,
              ),
              confidence: 'low',
              ...(aiDescribe ? { aiDescribe } : {}),
            },
          });
        }
        return {
          ...event,
          semantic: {
            source: 'aiDescribe',
            status: 'failed',
            error: result.error || 'aiDescribe failed.',
            ...(aiDescribe ? { aiDescribe } : {}),
          },
        };
      }
      return result.event ? (result.event as StudioRecordedEvent) : null;
    },
    [],
  );

  const mergeDescribedRecorderEvent = useCallback(
    (
      base: StudioRecordedEvent,
      described: StudioRecordedEvent,
      fallbackFrom?: ReturnType<typeof getMidsceneRecorderSemantic>,
    ) => {
      const semantic = getMidsceneRecorderSemantic(described);
      return normalizeInputRecorderSemantic({
        ...base,
        ...described,
        hashId: base.hashId,
        mergedHashIds: base.mergedHashIds,
        timestamp: base.timestamp,
        value:
          base.type === 'input' || base.type === 'keydown'
            ? base.value
            : described.value,
        semantic: semantic
          ? {
              ...semantic,
              ...(fallbackFrom ? { fallbackFrom } : {}),
            }
          : semantic,
        platformId: base.platformId,
        target: base.target,
        actionType: described.actionType || base.actionType,
        rawPayload: base.rawPayload,
      });
    },
    [],
  );

  const describeRecorderEventsNow = useCallback(
    async (
      session: StudioRecordingSession,
      events: StudioRecordedEvent[],
    ): Promise<StudioRecordedEvent[]> => {
      if (events.length === 0) {
        return [];
      }
      const aiDescribeEvents = await Promise.all(
        events.map((event) =>
          describeRecorderEventWithAiDescribe(session.id, event),
        ),
      );
      const results: Array<StudioRecordedEvent | undefined> = [];
      const fallbackEvents: StudioRecordedEvent[] = [];
      const fallbackAiDescribeSemantics: Array<
        ReturnType<typeof getMidsceneRecorderSemantic>
      > = [];
      const fallbackResultIndexes: number[] = [];

      aiDescribeEvents.forEach((event, index) => {
        const semantic = event ? getMidsceneRecorderSemantic(event) : undefined;
        const existingSemantic = getMidsceneRecorderSemantic(events[index]);
        if (semantic?.status === 'ready') {
          results[index] = mergeDescribedRecorderEvent(events[index], event!);
          return;
        }
        fallbackEvents.push(events[index]);
        fallbackAiDescribeSemantics.push(
          semantic?.source === 'aiDescribe'
            ? semantic
            : existingSemantic?.source === 'aiDescribe' &&
                existingSemantic.status === 'failed'
              ? existingSemantic
              : undefined,
        );
        fallbackResultIndexes.push(index);
      });

      if (fallbackEvents.length > 0) {
        let describedEvents: StudioRecordedEvent[];
        try {
          describedEvents = (await withTimeout(
            describeStudioRecorderEventsWithAI(fallbackEvents, {
              target: session.target,
            }),
            RECORDER_AI_FALLBACK_TASK_TIMEOUT_MS,
            'Timed out while analyzing recorder event with recorderAI.',
          )) as StudioRecordedEvent[];
        } catch (error) {
          fallbackEvents.forEach((event, fallbackIndex) => {
            const resultIndex = fallbackResultIndexes[fallbackIndex];
            const fallbackEvent = createFallbackRecorderEvent(event, error);
            const fallbackSemantic = getMidsceneRecorderSemantic(fallbackEvent);
            results[resultIndex] =
              fallbackSemantic && fallbackAiDescribeSemantics[fallbackIndex]
                ? {
                    ...fallbackEvent,
                    semantic: {
                      ...fallbackSemantic,
                      fallbackFrom: fallbackAiDescribeSemantics[fallbackIndex],
                    },
                  }
                : fallbackEvent;
          });
          return results.map((event, index) => event || events[index]);
        }
        describedEvents.forEach((event, fallbackIndex) => {
          const resultIndex = fallbackResultIndexes[fallbackIndex];
          results[resultIndex] = mergeDescribedRecorderEvent(
            fallbackEvents[fallbackIndex],
            event,
            fallbackAiDescribeSemantics[fallbackIndex],
          );
        });
      }

      return results.map((event, index) => event || events[index]);
    },
    [describeRecorderEventWithAiDescribe, mergeDescribedRecorderEvent],
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
          const [describedEvent] = await describeRecorderEventsNow(session, [
            task.event,
          ]);
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
      scheduleStudioRecorderSessionCheckpoint(updatedSession);
      const canonicalEvent =
        findSessionEventByHashLineage(updatedSession, event) || event;
      enqueueRecorderEventDescription(updatedSession.id, canonicalEvent);
      return updatedSession;
    },
    [enqueueRecorderEventDescription, scheduleStudioRecorderSessionCheckpoint],
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
        if (hasUnresolvedRecorderSemantic(getMidsceneRecorderSemantic(event))) {
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
    async (sessionId: string, timeoutMs?: number) => {
      await flushPendingRecorderInput(sessionId);
      if (
        descriptionQueueRef.current.length === 0 &&
        descriptionInFlightRef.current === 0
      ) {
        const session = stateRef.current.sessions.find(
          (item) => item.id === sessionId,
        );
        return !session?.events.some((event) =>
          hasUnresolvedRecorderSemantic(getMidsceneRecorderSemantic(event)),
        );
      }
      const pendingDescriptionCount =
        descriptionQueueRef.current.length + descriptionInFlightRef.current;
      const effectiveTimeoutMs =
        timeoutMs ??
        calculateRecorderDescriptionQueueTimeoutMs(pendingDescriptionCount);
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
          timeout = window.setTimeout(resolve, effectiveTimeoutMs);
        }),
      ]);
      if (timeout) {
        window.clearTimeout(timeout);
      }
      if (idleResolver) {
        descriptionIdleResolversRef.current.delete(idleResolver);
      }
      if (!settled) {
        return false;
      }
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      return !session?.events.some((event) =>
        hasUnresolvedRecorderSemantic(getMidsceneRecorderSemantic(event)),
      );
    },
    [flushPendingRecorderInput],
  );

  const updateRecorderFinalizationProgress = useCallback(
    (sessionId: string, finalization: PlaygroundRecorderFinalization) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session) {
        return;
      }
      const described = session.events.filter(
        (event) => getMidsceneRecorderSemantic(event)?.status === 'ready',
      ).length;
      const updatedSession: StudioRecordingSession = {
        ...session,
        status: 'finalizing',
        finalization: {
          jobId: finalization.jobId,
          actionHighWaterMark: finalization.actionHighWaterMark,
          accepted: finalization.accepted,
          captured: finalization.captured,
          degraded: finalization.degraded,
          pending: finalization.pending,
          described,
          startedAt: finalization.startedAt,
          completedAt: finalization.completedAt,
          finalLogSequence: finalization.finalLogSequence,
          error: finalization.error,
        },
        updatedAt: Date.now(),
      };
      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      scheduleStudioRecorderSessionCheckpoint(updatedSession);
    },
    [scheduleStudioRecorderSessionCheckpoint],
  );
  const updateRecorderFinalizationProgressRef = useRef(
    updateRecorderFinalizationProgress,
  );
  updateRecorderFinalizationProgressRef.current =
    updateRecorderFinalizationProgress;

  const drainRecorderRuntime = useCallback(async (sessionId: string) => {
    const runtime = recorderRuntimeRef.current;
    if (!runtime || runtime.sessionId !== sessionId) {
      return;
    }

    if (runtime.drainPromise) {
      runtime.drainAgain = true;
      await runtime.drainPromise;
      return;
    }

    const drainPromise = (async () => {
      do {
        runtime.drainAgain = false;
        if (
          recorderRuntimeRef.current !== runtime ||
          runtime.sessionId !== sessionId
        ) {
          return;
        }

        const result = await runtime.getRecorderEvents(runtime.logCursor);
        await recordPageEventsRef.current(sessionId, result.events);
        runtime.logCursor =
          result.nextLogSequence ?? result.nextIndex ?? runtime.logCursor;
        if (result.finalization) {
          runtime.finalization = result.finalization;
          updateRecorderFinalizationProgressRef.current(
            sessionId,
            result.finalization,
          );
        }
      } while (runtime.drainAgain);
    })();

    runtime.drainPromise = drainPromise.finally(() => {
      if (recorderRuntimeRef.current === runtime) {
        runtime.drainPromise = undefined;
        runtime.drainAgain = false;
      }
    });
    await runtime.drainPromise;
  }, []);

  const stopRecorderRuntime = useCallback(
    async (
      sessionId: string,
      { preserveRuntime = false }: { preserveRuntime?: boolean } = {},
    ) => {
      const runtime = recorderRuntimeRef.current;
      if (!runtime || runtime.sessionId !== sessionId) {
        return;
      }
      if (preserveRuntime) {
        runtime.preserveUntilExplicitClear = true;
      }

      if (!runtime.stopPromise) {
        runtime.stopping = true;
        runtime.stopPromise = (async () => {
          let stopResult: PlaygroundRecorderStopResult | undefined;
          try {
            stopResult = await runtime.stopRecorderSession?.();
            if (stopResult && !stopResult.ok) {
              throw new Error(
                stopResult.error || 'Recorder finalization could not start.',
              );
            }
            if (stopResult?.finalization) {
              runtime.finalization = stopResult.finalization;
              updateRecorderFinalizationProgressRef.current(
                sessionId,
                stopResult.finalization,
              );
            }
          } catch (error) {
            debugRecorder('failed to stop server recorder session:', error);
          }

          while (true) {
            try {
              await drainRecorderRuntime(sessionId);
            } catch (error) {
              debugRecorder('failed to drain recorder events:', error);
              break;
            }
            const finalization = runtime.finalization;
            if (!stopResult?.finalization || !finalization) {
              break;
            }
            const terminal =
              finalization.status === 'completed' ||
              finalization.status === 'failed';
            if (
              terminal &&
              runtime.logCursor >= (finalization.finalLogSequence ?? 0)
            ) {
              break;
            }
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 100);
            });
          }
        })();
      }

      try {
        await runtime.stopPromise;
      } finally {
        if (
          !runtime.preserveUntilExplicitClear &&
          recorderRuntimeRef.current === runtime
        ) {
          recorderRuntimeRef.current = null;
        }
      }
    },
    [drainRecorderRuntime],
  );

  const clearRecorderRuntime = useCallback((sessionId: string) => {
    const runtime = recorderRuntimeRef.current;
    if (runtime?.sessionId === sessionId) {
      recorderRuntimeRef.current = null;
    }
  }, []);

  const materializeSessionForScreenshotExport = useCallback(
    async (session: StudioRecordingSession, maxScreenshots?: number) => {
      if (studioPlayground.phase !== 'ready') {
        throw new Error(
          'Studio Playground is unavailable for recorder screenshots.',
        );
      }
      const { playgroundSDK } = studioPlayground.controller.state;
      const assetIds = session.events.flatMap((event) =>
        event.screenshotAsset ? [event.screenshotAsset.id] : [],
      );
      await playgroundSDK.pruneRecorderScreenshotAssets(session.id, assetIds);
      return materializeStudioRecorderSessionScreenshots(
        session,
        (assetId) => playgroundSDK.getRecorderScreenshotAsset(assetId),
        maxScreenshots,
      );
    },
    [studioPlayground],
  );

  const reportRecorderArchiveProgress = useCallback(
    (progress: { processedBytes: number; totalBytes: number }) => {
      const percent =
        progress.totalBytes > 0
          ? Math.min(
              100,
              Math.round((progress.processedBytes / progress.totalBytes) * 100),
            )
          : 100;
      message.open({
        key: 'studio-recorder-archive-export',
        type: percent >= 100 ? 'success' : 'loading',
        content:
          percent >= 100
            ? 'Recorder archive saved.'
            : `Exporting recorder archive… ${percent}%`,
        duration: percent >= 100 ? 2 : 0,
      });
    },
    [message],
  );

  const saveRecorderArchiveWithProgress = useCallback(
    async (
      options: Omit<
        Parameters<typeof saveStudioRecorderArchive>[0],
        'onProgress'
      >,
    ) => {
      try {
        await saveStudioRecorderArchive({
          ...options,
          onProgress: reportRecorderArchiveProgress,
        });
      } catch (error) {
        message.open({
          key: 'studio-recorder-archive-export',
          type: 'error',
          content: `Failed to export recorder archive: ${
            error instanceof Error ? error.message : String(error)
          }`,
          duration: 4,
        });
        throw error;
      }
    },
    [message, reportRecorderArchiveProgress],
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
        const metadata = await generateStudioRecorderMetadataWithAI(
          await materializeSessionForScreenshotExport(localSummarySession, 1),
        );
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
    [materializeSessionForScreenshotExport, upsertSessionSnapshot],
  );

  const describeUndescribedSessionEvents = useCallback(
    async (session: StudioRecordingSession) => {
      await flushPendingRecorderInput(session.id);
      const latestSession =
        stateRef.current.sessions.find((item) => item.id === session.id) ??
        session;
      const candidates = latestSession.events.filter((event) =>
        shouldDescribeRecorderEvent(event),
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
    if (
      !currentSession ||
      currentSession.status === 'recording' ||
      currentSession.status === 'finalizing' ||
      descriptionInFlightRef.current > 0 ||
      descriptionQueueRef.current.some(
        (task) => task.sessionId === currentSession.id,
      )
    ) {
      return;
    }

    const pendingEvents = currentSession.events.filter(
      (event) =>
        shouldDescribeRecorderEvent(event) &&
        getMidsceneRecorderSemantic(event)?.status === 'pending',
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
          calculateRecorderDescriptionQueueTimeoutMs(pendingEvents.length),
          'Timed out while draining recorder description queue.',
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

    if (session.status === 'recording') {
      const finalizingSession: StudioRecordingSession = {
        ...session,
        status: 'finalizing',
        updatedAt: Date.now(),
      };
      stateRef.current = upsertSessionInState(snapshot, finalizingSession);
      dispatch({ type: 'upsert-session', session: finalizingSession });
      scheduleStudioRecorderSessionCheckpoint(finalizingSession);
    }

    await stopRecorderRuntime(session.id, { preserveRuntime: true });
    await flushPendingRecorderInput(session.id);
    await flushStudioRecorderSessionCheckpoints();
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
    await persistStudioRecorderSession(updatedSession);
    void (async () => {
      try {
        const descriptionsSettled = await waitForRecorderEventDescriptions(
          session.id,
        );
        if (!descriptionsSettled) {
          await markPendingDescriptionsAsFallback(
            session.id,
            'Timed out while draining recorder description queue.',
          );
        }
        await flushStudioRecorderSessionCheckpoints();
        const sessionForMetadata =
          stateRef.current.sessions.find((item) => item.id === session.id) ??
          updatedSession;
        await generateSessionMetadata(sessionForMetadata);
      } finally {
        clearRecorderRuntime(session.id);
      }
    })();
  }, [
    generateSessionMetadata,
    markPendingDescriptionsAsFallback,
    clearRecorderRuntime,
    flushPendingRecorderInput,
    flushStudioRecorderSessionCheckpoints,
    scheduleStudioRecorderSessionCheckpoint,
    stopRecorderRuntime,
    waitForRecorderEventDescriptions,
    persistStudioRecorderSession,
  ]);

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getStudioRecorderSessions(),
      getCurrentStudioRecorderSessionId(),
    ])
      .then(async ([sessions, currentSessionId]) => {
        const replayableSessions = sessions.filter(isReplayableRecorderSession);
        const draftSessionIds = sessions
          .filter((session) => !isReplayableRecorderSession(session))
          .map((session) => session.id);
        await Promise.all(
          draftSessionIds.map((sessionId) =>
            deleteStudioRecorderSession(sessionId),
          ),
        );
        const replayableCurrentSessionId = replayableSessions.some(
          (session) => session.id === currentSessionId,
        )
          ? currentSessionId
          : null;
        if (replayableCurrentSessionId !== currentSessionId) {
          await setCurrentStudioRecorderSessionId(replayableCurrentSessionId);
        }
        if (cancelled) {
          return;
        }
        dispatch({
          type: 'initialize',
          sessions: replayableSessions,
          currentSessionId: replayableCurrentSessionId,
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
      void stopRecordingRef.current();
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!canStartRecording || !currentTarget) {
      return null;
    }

    stateRef.current = discardDraftSessions(stateRef.current);
    dispatch({ type: 'discard-draft-sessions' });
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
    await persistStudioRecorderSession(session);
    await setCurrentStudioRecorderSessionId(session.id);
    stateRef.current = upsertSessionInState(stateRef.current, session);
    dispatch({ type: 'upsert-session', session });
    return session;
  }, [canStartRecording, currentTarget, persistStudioRecorderSession]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (stateRef.current.currentSessionId === sessionId) {
        await stopRecordingRef.current();
      }
      await deleteStudioRecorderSession(sessionId);
      await clearRecorderScreenshotAssets(sessionId);
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
    [clearRecorderScreenshotAssets, stopRecording],
  );

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      const nextName = name.trim();
      if (!nextName) {
        return;
      }
      await flushPendingRecorderInput(sessionId);
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session || session.name === nextName) {
        return;
      }
      const updatedSession: StudioRecordingSession = {
        ...session,
        name: nextName,
        updatedAt: Date.now(),
      };
      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      await persistStudioRecorderSession(updatedSession);
    },
    [flushPendingRecorderInput, persistStudioRecorderSession],
  );

  const selectSession = useCallback((sessionId: string) => {
    const session = stateRef.current.sessions.find(
      (item) => item.id === sessionId,
    );
    void setCurrentStudioRecorderSessionId(
      session && isReplayableRecorderSession(session) ? session.id : null,
    );
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

      let descriptionsSettled = await waitForRecorderEventDescriptions(
        session.id,
      );
      const latestSessionForCodegen =
        stateRef.current.sessions.find((item) => item.id === session.id) ??
        session;
      let sessionForCodegen = normalizeSessionEventOrder(
        await describeUndescribedSessionEvents(latestSessionForCodegen),
      );
      if (!descriptionsSettled) {
        descriptionsSettled = await waitForRecorderEventDescriptions(
          session.id,
        );
      }
      if (!descriptionsSettled) {
        await markPendingDescriptionsAsFallback(
          session.id,
          'Timed out while draining recorder description queue.',
        );
        sessionForCodegen =
          stateRef.current.sessions.find((item) => item.id === session.id) ??
          sessionForCodegen;
      }
      sessionForCodegen =
        excludeImplicitNavigationStatesFromCodegen(sessionForCodegen);
      options.onProgress?.({
        step: 'prepare',
        status: 'completed',
        details: `Prepared ${sessionForCodegen.events.length} recorded events`,
      });

      if (!sessionForCodegen.metadataGeneratedAt) {
        try {
          options.onProgress?.({
            step: 'metadata',
            status: 'loading',
            details: 'Analyzing session content...',
          });
          const metadata = await generateStudioRecorderMetadataWithAI(
            await materializeSessionForScreenshotExport(sessionForCodegen, 1),
          );
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
            await persistStudioRecorderSession(sessionForCodegen);
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
        code = await generateStudioRecorderCodeWithAI(
          await materializeSessionForScreenshotExport(sessionForCodegen),
          {
            type,
            language: options.language,
            onChunk: options.onChunk,
          },
        );
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
      await persistStudioRecorderSession(updatedSession);
      return code;
    },
    [
      describeUndescribedSessionEvents,
      flushPendingRecorderInput,
      markPendingDescriptionsAsFallback,
      materializeSessionForScreenshotExport,
      persistStudioRecorderSession,
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

  const deleteSessionCode = useCallback(
    async (sessionId: string, type: StudioRecorderCodeType) => {
      await flushPendingRecorderInput(sessionId);
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!session?.generatedCode?.[type]) {
        return;
      }

      const generatedCode = { ...session.generatedCode };
      delete generatedCode[type];
      const hasRemainingCode = Boolean(
        generatedCode.markdown ||
          generatedCode.yaml ||
          generatedCode.playwright,
      );
      const updatedSession: StudioRecordingSession = {
        ...session,
        generatedCode: hasRemainingCode
          ? {
              ...generatedCode,
              updatedAt: Date.now(),
            }
          : undefined,
        updatedAt: Date.now(),
      };
      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      await persistStudioRecorderSession(updatedSession);
      if (type === 'markdown' && !isReplayableRecorderSession(updatedSession)) {
        await setCurrentStudioRecorderSessionId(null);
      }
    },
    [flushPendingRecorderInput, persistStudioRecorderSession],
  );

  const recordPageEvent = useCallback(
    async (sessionId: string, event: PlaygroundPageRecordedEvent) => {
      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!snapshot.isRecording || !session || !hasRecorderSession(session)) {
        return;
      }

      const studioEvent = mapPreviewRecorderEventToStudioRecordedEvent({
        event,
        target: session.target,
      });
      const pendingEvent = createPendingRecorderEvent(studioEvent);
      const pendingInput = pendingRecorderInputRef.current;
      if (
        pendingInput &&
        recorderEventHashMatches(pendingInput.event, pendingEvent.hashId)
      ) {
        const shouldPreserveRecorderValue =
          pendingInput.event.type === 'input' ||
          pendingInput.event.type === 'keydown';
        const mergedHashIds = normalizeRecorderEventMergedHashIds(
          mergeRecorderEventHashLineage(pendingInput.event, pendingEvent),
        );
        pendingRecorderInputRef.current = {
          sessionId: pendingInput.sessionId,
          event: normalizeInputRecorderSemantic({
            ...pendingInput.event,
            ...pendingEvent,
            hashId: pendingInput.event.hashId,
            mergedHashIds,
            timestamp: pendingInput.event.timestamp,
            platformId: pendingInput.event.platformId,
            target: pendingInput.event.target,
            value: shouldPreserveRecorderValue
              ? pendingInput.event.value
              : pendingEvent.value,
            actionType:
              pendingEvent.actionType || pendingInput.event.actionType,
            rawPayload: shouldPreserveRecorderValue
              ? pendingInput.event.rawPayload
              : pendingEvent.rawPayload || pendingInput.event.rawPayload,
          }),
        };
        return;
      }
      if (
        session.events.some((item) =>
          recorderEventHashMatches(item, pendingEvent.hashId),
        )
      ) {
        await updateRecordedEvent(session.id, pendingEvent);
        if (shouldDescribeRecorderEvent(pendingEvent)) {
          enqueueRecorderEventDescription(session.id, pendingEvent);
        }
        return;
      }

      if (isStudioPreviewInputEvent(pendingEvent)) {
        const latestEvent = session.events.at(-1);
        if (latestEvent && isRecorderEventBefore(pendingEvent, latestEvent)) {
          await flushPendingRecorderInput();
          await persistRecordedEvent(session.id, pendingEvent);
          return;
        }

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
    [
      enqueueRecorderEventDescription,
      flushPendingRecorderInput,
      persistRecordedEvent,
      updateRecordedEvent,
    ],
  );
  recordPageEventRef.current = recordPageEvent;

  const recordPageEvents = useCallback(
    async (sessionId: string, events: PlaygroundPageRecordedEvent[]) => {
      if (events.length <= 1) {
        if (events[0]) {
          await recordPageEventRef.current(sessionId, events[0]);
        }
        return;
      }

      const snapshot = stateRef.current;
      const session = snapshot.sessions.find((item) => item.id === sessionId);
      if (!snapshot.isRecording || !session || !hasRecorderSession(session)) {
        return;
      }

      let updatedSession = session;
      let pendingInput = pendingRecorderInputRef.current;
      const descriptionCandidates = new Map<string, StudioRecordedEvent>();
      const commitEvent = (event: StudioRecordedEvent) => {
        const nextSession = upsertEvent(updatedSession, event);
        if (nextSession === updatedSession) {
          return;
        }
        updatedSession = nextSession;
        const canonicalEvent =
          findSessionEventByHashLineage(updatedSession, event) || event;
        descriptionCandidates.set(
          canonicalEvent.eventId || canonicalEvent.hashId,
          canonicalEvent,
        );
      };
      const flushPendingInput = () => {
        if (!pendingInput || pendingInput.sessionId !== session.id) {
          return;
        }
        commitEvent(pendingInput.event);
        pendingInput = null;
      };

      for (const event of events) {
        const studioEvent = mapPreviewRecorderEventToStudioRecordedEvent({
          event,
          target: session.target,
        });
        const pendingEvent = createPendingRecorderEvent(studioEvent);
        if (
          pendingInput &&
          recorderEventHashMatches(pendingInput.event, pendingEvent.hashId)
        ) {
          const shouldPreserveRecorderValue =
            pendingInput.event.type === 'input' ||
            pendingInput.event.type === 'keydown';
          pendingInput = {
            sessionId: pendingInput.sessionId,
            event: normalizeInputRecorderSemantic({
              ...pendingInput.event,
              ...pendingEvent,
              hashId: pendingInput.event.hashId,
              mergedHashIds: normalizeRecorderEventMergedHashIds(
                mergeRecorderEventHashLineage(pendingInput.event, pendingEvent),
              ),
              timestamp: pendingInput.event.timestamp,
              platformId: pendingInput.event.platformId,
              target: pendingInput.event.target,
              value: shouldPreserveRecorderValue
                ? pendingInput.event.value
                : pendingEvent.value,
              actionType:
                pendingEvent.actionType || pendingInput.event.actionType,
              rawPayload: shouldPreserveRecorderValue
                ? pendingInput.event.rawPayload
                : pendingEvent.rawPayload || pendingInput.event.rawPayload,
            }),
          };
          continue;
        }

        if (
          updatedSession.events.some((item) =>
            recorderEventHashMatches(item, pendingEvent.hashId),
          )
        ) {
          commitEvent(pendingEvent);
          continue;
        }

        if (isStudioPreviewInputEvent(pendingEvent)) {
          const latestEvent = updatedSession.events.at(-1);
          if (latestEvent && isRecorderEventBefore(pendingEvent, latestEvent)) {
            flushPendingInput();
            commitEvent(pendingEvent);
            continue;
          }
          if (
            pendingInput &&
            canCoalesceRecorderInput(pendingInput, session.id, pendingEvent)
          ) {
            pendingInput = {
              sessionId: session.id,
              event: mergeRecorderInputEvents(pendingInput.event, pendingEvent),
            };
            continue;
          }
          flushPendingInput();
          pendingInput = { sessionId: session.id, event: pendingEvent };
          continue;
        }

        flushPendingInput();
        commitEvent(pendingEvent);
      }

      pendingRecorderInputRef.current = pendingInput;
      if (updatedSession === session) {
        return;
      }
      updatedSession = applyLocalSessionSummary(updatedSession);
      stateRef.current = upsertSessionInState(snapshot, updatedSession);
      dispatch({ type: 'upsert-session', session: updatedSession });
      scheduleStudioRecorderSessionCheckpoint(updatedSession);
      for (const candidate of descriptionCandidates.values()) {
        const canonicalEvent =
          findSessionEventByHashLineage(updatedSession, candidate) || candidate;
        enqueueRecorderEventDescription(session.id, canonicalEvent);
      }
    },
    [enqueueRecorderEventDescription, scheduleStudioRecorderSessionCheckpoint],
  );
  recordPageEventsRef.current = recordPageEvents;

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
        logCursor: 0,
        stopping: false,
        getRecorderEvents: playgroundSDK.getRecorderEvents.bind(playgroundSDK),
        describeRecorderEventAtPoint:
          typeof playgroundSDK.describeRecorderEventAtPoint === 'function'
            ? playgroundSDK.describeRecorderEventAtPoint.bind(playgroundSDK)
            : undefined,
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
        await stopRecordingRef.current();
        dispatch({ type: 'set-error', error });
        return;
      }

      if (result.supported === false) {
        const error =
          result.error ||
          'Current target does not expose preview interaction controls.';
        debugRecorder('preview recorder unavailable: %s', error);
        await stopRecordingRef.current();
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
        await saveRecorderArchiveWithProgress({
          title: 'Export Recorder Markdown Replay',
          defaultFileName: getStudioRecorderExportVariantFileName(
            session,
            'markdown',
            'zip',
          ),
          plan: createStudioRecorderMarkdownArchivePlan(session),
          createFallbackContent: async () =>
            createStudioRecorderMarkdownZipBase64(
              await materializeSessionForScreenshotExport(session),
            ),
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
    [
      exportSessionYaml,
      flushPendingRecorderInput,
      materializeSessionForScreenshotExport,
      saveRecorderArchiveWithProgress,
    ],
  );

  const loadSessionScreenshots = useCallback(
    async (sessionId: string) => {
      await flushPendingRecorderInput(sessionId);
      const session = stateRef.current.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session) {
        throw new Error(`Recorder session is unavailable: ${sessionId}`);
      }
      return (await materializeSessionForScreenshotExport(session)).events;
    },
    [flushPendingRecorderInput, materializeSessionForScreenshotExport],
  );

  const getRecorderScreenshotAssetUrl = useCallback(
    (assetId: string) => {
      if (studioPlayground.phase !== 'ready') {
        return null;
      }
      return studioPlayground.controller.state.playgroundSDK.getRecorderScreenshotAssetUrl(
        assetId,
      );
    },
    [studioPlayground],
  );

  const exportAllZip = useCallback(async () => {
    await flushPendingRecorderInput();
    const sessions = stateRef.current.sessions;
    if (!sessions.length) {
      return;
    }
    await saveRecorderArchiveWithProgress({
      title: 'Export Recorder Archive',
      defaultFileName: 'midscene-studio-recordings.zip',
      plan: createStudioRecorderArchivePlan(sessions),
      createFallbackContent: async () => {
        let remainingScreenshots =
          DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS;
        const exportSessions: StudioRecordingSession[] = [];
        for (const session of sessions) {
          const exportSession = await materializeSessionForScreenshotExport(
            session,
            remainingScreenshots,
          );
          remainingScreenshots -= exportSession.events.filter(
            (event, index) =>
              Boolean(event.screenshotWithBox) &&
              !session.events[index]?.screenshotWithBox,
          ).length;
          exportSessions.push(exportSession);
        }
        return createStudioRecorderZipBase64(exportSessions);
      },
    });
  }, [
    flushPendingRecorderInput,
    materializeSessionForScreenshotExport,
    saveRecorderArchiveWithProgress,
  ]);

  const contextValue = useMemo<StudioRecorderContextValue>(
    () => ({
      state,
      currentSession,
      currentTarget,
      canStartRecording,
      startRecording,
      stopRecording,
      deleteSession,
      renameSession,
      selectSession,
      generateSessionYaml,
      generateSessionCode,
      deleteSessionCode,
      exportSessionJson,
      exportSessionYaml,
      exportSessionCode,
      getRecorderScreenshotAssetUrl,
      loadSessionScreenshots,
      exportAllZip,
    }),
    [
      canStartRecording,
      currentSession,
      currentTarget,
      deleteSession,
      deleteSessionCode,
      exportAllZip,
      exportSessionJson,
      exportSessionYaml,
      exportSessionCode,
      getRecorderScreenshotAssetUrl,
      loadSessionScreenshots,
      generateSessionCode,
      generateSessionYaml,
      renameSession,
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
