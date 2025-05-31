// import { createStore } from 'zustand/vanilla';
import * as Z from 'zustand';

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

// Record related types and store
export interface RecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown';
  timestamp: number;
  x?: number;
  y?: number;
  value?: string;
  element?: HTMLElement;
  targetTagName?: string;
  targetId?: string;
  targetClassName?: string;
  isLabelClick?: boolean;
  labelInfo?: {
    htmlFor?: string;
    textContent?: string;
  };
  isTrusted?: boolean;
  screenshotBefore?: string;
  screenshotAfter?: string;
  screenshot?: string;
  detail?: number;
  inputType?: string;
  url?: string;
  title?: string;
  viewportX?: number;
  viewportY?: number;
  width?: number;
  height?: number;
  // Page size information - required by RecordTimeline
  pageWidth: number;
  pageHeight: number;
  // Natural language description of the element
  elementDescription?: string;
}

// Recording session interface
export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  events: RecordedEvent[];
  status: 'idle' | 'recording' | 'completed';
  duration?: number; // in milliseconds
  url?: string; // The URL where recording started
}

// Storage keys
const RECORDING_SESSIONS_KEY = 'midscene-recording-sessions';
const CURRENT_SESSION_ID_KEY = 'midscene-current-session-id';

// Helper functions for persistence
const loadSessionsFromStorage = (): RecordingSession[] => {
  try {
    const stored = localStorage.getItem(RECORDING_SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load sessions from storage:', error);
    return [];
  }
};

const saveSessionsToStorage = (sessions: RecordingSession[]) => {
  try {
    localStorage.setItem(RECORDING_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save sessions to storage:', error);
  }
};

const loadCurrentSessionIdFromStorage = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_SESSION_ID_KEY);
  } catch (error) {
    console.error('Failed to load current session ID from storage:', error);
    return null;
  }
};

const saveCurrentSessionIdToStorage = (sessionId: string | null) => {
  try {
    if (sessionId) {
      localStorage.setItem(CURRENT_SESSION_ID_KEY, sessionId);
    } else {
      localStorage.removeItem(CURRENT_SESSION_ID_KEY);
    }
  } catch (error) {
    console.error('Failed to save current session ID to storage:', error);
  }
};

export const useRecordingSessionStore = create<{
  sessions: RecordingSession[];
  currentSessionId: string | null;
  addSession: (session: RecordingSession) => void;
  updateSession: (sessionId: string, updates: Partial<RecordingSession>) => void;
  deleteSession: (sessionId: string) => void;
  setCurrentSession: (sessionId: string | null) => void;
  getCurrentSession: () => RecordingSession | null;
}>((set, get) => ({
  sessions: loadSessionsFromStorage(),
  currentSessionId: loadCurrentSessionIdFromStorage(),
  addSession: (session) => set((state) => {
    const newSessions = [...state.sessions, session];
    saveSessionsToStorage(newSessions);
    return { sessions: newSessions };
  }),
  updateSession: (sessionId, updates) => set((state) => {
    const newSessions = state.sessions.map(s => s.id === sessionId ? { ...s, ...updates } : s);
    saveSessionsToStorage(newSessions);
    return { sessions: newSessions };
  }),
  deleteSession: (sessionId) => set((state) => {
    const newSessions = state.sessions.filter(s => s.id !== sessionId);
    saveSessionsToStorage(newSessions);
    return { sessions: newSessions };
  }),
  setCurrentSession: (sessionId) => {
    saveCurrentSessionIdToStorage(sessionId);
    set({ currentSessionId: sessionId });
  },
  getCurrentSession: () => {
    const state = get();
    return state.sessions.find(s => s.id === state.currentSessionId) || null;
  }
}));

export const useRecordStore = create<{
  isRecording: boolean;
  events: RecordedEvent[];
  setIsRecording: (recording: boolean) => void;
  updateEvent: (event: RecordedEvent) => void;
  addEvent: (event: RecordedEvent) => void;
  setEvents: (events: RecordedEvent[]) => void;
  clearEvents: () => void;
}>((set) => ({
  isRecording: false,
  events: [],
  setIsRecording: (recording: boolean) => {
    set({ isRecording: recording });
  },
  addEvent: (event: RecordedEvent) => {
    set((state) => ({
      events: [...state.events, event],
    }));
  },
  updateEvent: (event: RecordedEvent) => {
    set((state) => ({
      events: state.events.map((e) => (e.timestamp === event.timestamp ? event : e)),
    }));
  },
  setEvents: (events: RecordedEvent[]) => {
    set({ events });
  },
  clearEvents: () => {
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
  popupTab: 'playground' | 'bridge' | 'record';
  setPopupTab: (tab: 'playground' | 'bridge' | 'record') => void;
}>((set, get) => {
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
    setPopupTab: (tab: 'playground' | 'bridge' | 'record') => {
      set({ popupTab: tab });
    },
  };
});
