import type { ChromeRecordedEvent } from '@midscene/recorder';
// import { createStore } from 'zustand/vanilla';
import * as Z from 'zustand';
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

// Helper functions for events persistence
const loadEventsFromStorage = (): ChromeRecordedEvent[] => {
  try {
    const stored = localStorage.getItem('midscene-recording-events');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load events from storage:', error);
    return [];
  }
};

const saveEventsToStorage = (events: ChromeRecordedEvent[]) => {
  try {
    localStorage.setItem('midscene-recording-events', JSON.stringify(events));
  } catch (error) {
    console.error('Failed to save events to storage:', error);
  }
};

const clearEventsFromStorage = () => {
  try {
    localStorage.removeItem('midscene-recording-events');
  } catch (error) {
    console.error('Failed to clear events from storage:', error);
  }
};

export const useRecordStore = create<{
  isRecording: boolean;
  events: ChromeRecordedEvent[];
  isInitialized: boolean;
  initialize: () => Promise<void>;
  setIsRecording: (recording: boolean) => Promise<void>;
  updateEvent: (event: ChromeRecordedEvent) => void;
  addEvent: (event: ChromeRecordedEvent) => void;
  setEvents: (events: ChromeRecordedEvent[]) => void;
  clearEvents: () => void;
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
      const events = isRecording ? loadEventsFromStorage() : [];
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
        clearEventsFromStorage();
      }
    } catch (error) {
      console.error('Failed to set recording state:', error);
    }
  },
  addEvent: (event: ChromeRecordedEvent) => {
    set((state) => {
      const newEvents = [...state.events, event];
      if (state.isRecording) {
        saveEventsToStorage(newEvents);
      }
      return { events: newEvents };
    });
  },
  updateEvent: (event: ChromeRecordedEvent) => {
    set((state) => {
      const newEvents = state.events.map((e) =>
        e.timestamp === event.timestamp ? event : e,
      );
      if (state.isRecording) {
        saveEventsToStorage(newEvents);
      }
      return { events: newEvents };
    });
  },
  setEvents: (events: ChromeRecordedEvent[]) => {
    const state = get();
    if (state.isRecording) {
      saveEventsToStorage(events);
    }
    set({ events });
  },
  clearEvents: () => {
    clearEventsFromStorage();
    set({ events: [] });
  },
}));

const CONFIG_KEY = 'midscene-env-config';
const SERVICE_MODE_KEY = 'midscene-service-mode';
const TRACKING_ACTIVE_TAB_KEY = 'midscene-tracking-active-tab';
const getConfigStringFromLocalStorage = () => {
  const configString = localStorage.getItem(CONFIG_KEY);
  return configString || '';
};
const parseConfig = (configString: string) => {
  const lines = configString.split('\n');
  const config: Record<string, string> = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return;

    const cleanLine = trimmed
      .replace(/^export\s+/i, '')
      .replace(/;$/, '')
      .trim();
    const match = cleanLine.match(/^(\w+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      let parsedValue = value.trim();

      // Remove surrounding quotes if present
      if (
        (parsedValue.startsWith("'") && parsedValue.endsWith("'")) ||
        (parsedValue.startsWith('"') && parsedValue.endsWith('"'))
      ) {
        parsedValue = parsedValue.slice(1, -1);
      }

      config[key] = parsedValue;
    }
  });
  return config;
};

/**
 * Service Mode
 *
 * - Server: use a node server to run the code
 * - In-Browser: use browser's fetch API to run the code
 * - In-Browser-Extension: use browser's fetch API to run the code, but the page is running in the extension context
 */
export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension'; // | 'Extension';
export const useEnvConfig = create<{
  serviceMode: ServiceModeType;
  setServiceMode: (serviceMode: ServiceModeType) => void;
  config: Record<string, string>;
  configString: string;
  setConfig: (config: Record<string, string>) => void;
  loadConfig: (configString: string) => void;
  forceSameTabNavigation: boolean;
  setForceSameTabNavigation: (forceSameTabNavigation: boolean) => void;
  popupTab: 'playground' | 'bridge' | 'recorder';
  setPopupTab: (tab: 'playground' | 'bridge' | 'recorder') => void;
}>((set) => {
  const configString = getConfigStringFromLocalStorage();
  const config = parseConfig(configString);
  const ifInExtension = window.location.href.startsWith('chrome-extension');
  const savedServiceMode = localStorage.getItem(
    SERVICE_MODE_KEY,
  ) as ServiceModeType | null;
  const savedForceSameTabNavigation =
    localStorage.getItem(TRACKING_ACTIVE_TAB_KEY) !== 'false';
  return {
    serviceMode: ifInExtension
      ? 'In-Browser-Extension'
      : savedServiceMode || 'Server',
    setServiceMode: (serviceMode: ServiceModeType) => {
      if (ifInExtension)
        throw new Error('serviceMode cannot be set in extension');
      set({ serviceMode });
      localStorage.setItem(SERVICE_MODE_KEY, serviceMode);
    },
    config,
    configString,
    setConfig: (config) => set({ config }),
    loadConfig: (configString: string) => {
      const config = parseConfig(configString);
      set({ config, configString });
      localStorage.setItem(CONFIG_KEY, configString);
    },
    forceSameTabNavigation: savedForceSameTabNavigation,
    setForceSameTabNavigation: (forceSameTabNavigation: boolean) => {
      set({ forceSameTabNavigation });
      localStorage.setItem(
        TRACKING_ACTIVE_TAB_KEY,
        forceSameTabNavigation.toString(),
      );
    },
    popupTab: 'playground',
    setPopupTab: (tab: 'playground' | 'bridge' | 'recorder') => {
      set({ popupTab: tab });
    },
  };
});
