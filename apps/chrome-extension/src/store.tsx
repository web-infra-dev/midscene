import type { ChromeRecordedEvent } from '@midscene/recorder';
// import { createStore } from 'zustand/vanilla';
import * as Z from 'zustand';
import { recordLogger } from './extension/recorder/logger';
import { dbManager, initializeDB } from './utils/indexedDB';

const { create } = Z;
export const useBlackboardPreference = create<{
  markerVisible: boolean;
  elementsVisible: boolean;
  setMarkerVisible: (visible: boolean) => void;
  setTextsVisible: (visible: boolean) => void;
}>((set) => ({
  markerVisible: true,
  elementsVisible: true,
  setMarkerVisible: (visible: boolean) => {
    set({ markerVisible: visible });
  },
  setTextsVisible: (visible: boolean) => {
    set({ elementsVisible: visible });
  },
}));

// Recording session interface
export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  events: ChromeRecordedEvent[];
  status: 'idle' | 'recording' | 'completed';
  duration?: number; // in milliseconds
  url?: string; // The URL where recording started
  generatedCode?: {
    playwright?: string;
    yaml?: string;
    lastGenerated?: number; // timestamp of last generation
  };
}

// Storage keys
const RECORDING_SESSIONS_KEY = 'midscene-recording-sessions';
const CURRENT_SESSION_ID_KEY = 'midscene-current-session-id';
const RECORDING_STATE_KEY = 'midscene-recording-state';

// Helper functions for persistence with IndexedDB
const loadSessionsFromStorage = async (): Promise<RecordingSession[]> => {
  try {
    // initializeDB is now idempotent, safe to call
    return await dbManager.getAllSessions();
  } catch (error) {
    console.error('Failed to load sessions from IndexedDB:', error);
    return [];
  }
};

const saveSessionsToStorage = async (sessions: RecordingSession[]) => {
  // This function is now handled by individual session operations in IndexedDB
  // Keeping for compatibility but no longer used
};

const loadCurrentSessionIdFromStorage = async (): Promise<string | null> => {
  try {
    return await dbManager.getCurrentSessionId();
  } catch (error) {
    console.error('Failed to load current session ID from IndexedDB:', error);
    return null;
  }
};

const saveCurrentSessionIdToStorage = async (sessionId: string | null) => {
  try {
    await dbManager.setCurrentSessionId(sessionId);
  } catch (error) {
    console.error('Failed to save current session ID to IndexedDB:', error);
  }
};

// Helper functions for recording state persistence with IndexedDB
const loadRecordingStateFromStorage = async (): Promise<boolean> => {
  try {
    return await dbManager.getRecordingState();
  } catch (error) {
    console.error('Failed to load recording state from IndexedDB:', error);
    return false;
  }
};

const saveRecordingStateToStorage = async (isRecording: boolean) => {
  try {
    await dbManager.setRecordingState(isRecording);
  } catch (error) {
    console.error('Failed to save recording state to IndexedDB:', error);
  }
};

export const useRecordingSessionStore = create<{
  sessions: RecordingSession[];
  currentSessionId: string | null;
  isInitialized: boolean;
  initializeStore: () => Promise<void>;
  addSession: (session: RecordingSession) => Promise<void>;
  updateSession: (
    sessionId: string,
    updates: Partial<RecordingSession>,
  ) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setCurrentSession: (sessionId: string | null) => Promise<void>;
  getCurrentSession: () => RecordingSession | null;
}>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isInitialized: false,
  initializeStore: async () => {
    // Prevent duplicate initialization
    const currentState = get();
    if (currentState.isInitialized) {
      return;
    }

    try {
      // Ensure database initialization
      await initializeDB();
      const [sessions, currentSessionId] = await Promise.all([
        loadSessionsFromStorage(),
        loadCurrentSessionIdFromStorage(),
      ]);
      set({ sessions, currentSessionId, isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize recording session store:', error);
      set({ isInitialized: true });
    }
  },
  addSession: async (session) => {
    try {
      await dbManager.addSession(session);
      const sessions = await dbManager.getAllSessions();
      set({ sessions });
    } catch (error) {
      console.error('Failed to add session:', error);
    }
  },
  updateSession: async (sessionId, updates) => {
    try {
      await dbManager.updateSession(sessionId, updates);
      const sessions = await dbManager.getAllSessions();
      set({ sessions });
    } catch (error) {
      console.error('Failed to update session:', error);
      // Try to recover by ensuring the session exists in memory
      const { sessions } = get();
      const sessionInMemory = sessions.find((s) => s.id === sessionId);
      if (sessionInMemory) {
        const updatedSession = {
          ...sessionInMemory,
          ...updates,
          updatedAt: Date.now(),
        };
        const newSessions = sessions.map((s) =>
          s.id === sessionId ? updatedSession : s,
        );
        set({ sessions: newSessions });
      }
    }
  },
  deleteSession: async (sessionId) => {
    try {
      await dbManager.deleteSession(sessionId);
      const sessions = await dbManager.getAllSessions();
      set({ sessions });
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },
  setCurrentSession: async (sessionId) => {
    try {
      await saveCurrentSessionIdToStorage(sessionId);
      set({ currentSessionId: sessionId });
    } catch (error) {
      console.error('Failed to set current session:', error);
    }
  },
  getCurrentSession: () => {
    const state = get();
    return state.sessions.find((s) => s.id === state.currentSessionId) || null;
  },
}));

// Helper functions for events persistence with IndexedDB
const loadEventsFromStorage = async (): Promise<ChromeRecordedEvent[]> => {
  try {
    return await dbManager.getRecordingEvents();
  } catch (error) {
    console.error('Failed to load events from IndexedDB:', error);
    return [];
  }
};

function mergeEvents(
  oldEvents: ChromeRecordedEvent[],
  newEvents: ChromeRecordedEvent[],
): ChromeRecordedEvent[] {
  const mergedEventsMap = new Map<string, ChromeRecordedEvent>();

  // Add old events to map, prioritizing them initially
  for (const event of oldEvents) {
    if (event.hashId) {
      mergedEventsMap.set(event.hashId, event);
    }
  }

  // Add new events to map, replacing old ones if hashId matches
  for (const event of newEvents) {
    if (event.hashId) {
      mergedEventsMap.set(event.hashId, event);
    }
  }

  const mergedArray = Array.from(mergedEventsMap.values());
  // Sort events by timestamp in ascending order
  mergedArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return mergedArray;
}

const saveEventsToStorage = async (events: ChromeRecordedEvent[]) => {
  try {
    const existingEvents = await dbManager.getRecordingEvents();
    const combinedEvents = mergeEvents(existingEvents, events);
    await dbManager.setRecordingEvents(combinedEvents);
  } catch (error) {
    console.error('Failed to save events to IndexedDB:', error);
  }
};

const clearEventsFromStorage = async () => {
  try {
    await dbManager.clearRecordingEvents();
  } catch (error) {
    console.error('Failed to clear events from IndexedDB:', error);
  }
};

export const useRecordStore = create<{
  isRecording: boolean;
  events: ChromeRecordedEvent[];
  isInitialized: boolean;
  initialize: () => Promise<void>;
  setIsRecording: (recording: boolean) => Promise<void>;
  updateEvent: (event: ChromeRecordedEvent) => Promise<void>;
  addEvent: (event: ChromeRecordedEvent) => Promise<void>;
  setEvents: (events: ChromeRecordedEvent[]) => Promise<void>;
  clearEvents: () => Promise<void>;
  emergencySaveEvents: (events?: ChromeRecordedEvent[]) => Promise<void>;
}>((set, get) => ({
  isRecording: false,
  events: [],
  isInitialized: false,
  initialize: async () => {
    // Prevent duplicate initialization
    const currentState = get();
    if (currentState.isInitialized) {
      return;
    }

    try {
      // Ensure database initialization
      await initializeDB();
      const isRecording = await loadRecordingStateFromStorage();
      const events = isRecording ? await loadEventsFromStorage() : [];
      set({ isRecording, events, isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize record store:', error);
      set({ isInitialized: true });
    }
  },
  setIsRecording: async (recording: boolean) => {
    try {
      await saveRecordingStateToStorage(recording);
      set({ isRecording: recording });
      // Clear events from storage when stopping recording
      if (!recording) {
        await clearEventsFromStorage();
      }
    } catch (error) {
      console.error('Failed to set recording state:', error);
    }
  },
  addEvent: async (event: ChromeRecordedEvent) => {
    const state = get();
    const newEvents = [...state.events, event];
    set({ events: newEvents });
    if (state.isRecording) {
      const sessionId = useRecordingSessionStore.getState().currentSessionId;
      if (sessionId) {
        await dbManager.updateSession(sessionId, {
          events: newEvents,
          updatedAt: Date.now(),
        });
      }
      await saveEventsToStorage(newEvents);
    }
  },
  updateEvent: async (event: ChromeRecordedEvent) => {
    const state = get();
    const newEvents = mergeEvents(state.events, [event]);
    set({ events: newEvents });
    if (state.isRecording) {
      const sessionId = useRecordingSessionStore.getState().currentSessionId;
      if (sessionId) {
        await dbManager.updateSession(sessionId, {
          events: newEvents,
          updatedAt: Date.now(),
        });
      }
    }
  },
  setEvents: async (events: ChromeRecordedEvent[]) => {
    const state = get();
    const newEvents = mergeEvents(state.events, events);
    set({ events: newEvents });
    recordLogger.info('Setting events', {
      events: newEvents,
      newEvents,
      eventsCount: newEvents.length,
    });
    if (state.isRecording) {
      const sessionId = useRecordingSessionStore.getState().currentSessionId;
      if (sessionId) {
        await dbManager.updateSession(sessionId, {
          events: newEvents,
          updatedAt: Date.now(),
        });
      }
    }
  },
  clearEvents: async () => {
    await clearEventsFromStorage();
    const sessionId = useRecordingSessionStore.getState().currentSessionId;
    if (sessionId) {
      // Get current session
      const currentSession = useRecordingSessionStore.getState().sessions.find(s => s.id === sessionId);
      await dbManager.updateSession(sessionId, {
        events: [],
        updatedAt: Date.now(),
        // Clear generatedCode as well
        generatedCode: undefined,
      });
    }
    set({ events: [] });
  },
  emergencySaveEvents: async (events?: ChromeRecordedEvent[]) => {
    const state = get();
    const eventsToSave = events || state.events;
    if (eventsToSave.length > 0) {
      try {
        await dbManager.emergencySetRecordingEvents(eventsToSave);
      } catch (error) {
        console.error('Emergency save failed:', error);
      }
    }
  },
}));

const CONFIG_KEY = 'midscene-env-config';

/**
 * Service Mode
 *
 * - Server: use a node server to run the code
 * - In-Browser: use browser's fetch API to run the code
 * - In-Browser-Extension: use browser's fetch API to run the code, but the page is running in the extension context
 */
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension'; // | 'Extension';
