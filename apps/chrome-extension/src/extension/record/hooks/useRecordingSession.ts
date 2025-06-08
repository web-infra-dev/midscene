import { message } from 'antd';
import { useCallback } from 'react';
import {
  type RecordingSession,
  useRecordStore,
  useRecordingSessionStore,
} from '../../../store';
import { exportEventsToFile, generateDefaultSessionName } from '../utils';

export const useRecordingSession = (currentTab: chrome.tabs.Tab | null) => {
  const {
    sessions,
    currentSessionId,
    addSession,
    updateSession,
    deleteSession,
    setCurrentSession,
    getCurrentSession,
  } = useRecordingSessionStore();

  const { clearEvents, setEvents } = useRecordStore();

  // Create session utility function
  const createNewSession = useCallback(
    (sessionName?: string) => {
      const name = sessionName || generateDefaultSessionName();
      console.log('[RecordingSession] Creating new session:', {
        name,
        url: currentTab?.url,
      });

      const newSession: RecordingSession = {
        id: `session-${Date.now()}`,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        status: 'idle',
        url: currentTab?.url,
      };

      addSession(newSession);
      setCurrentSession(newSession.id);
      clearEvents();

      console.log('[RecordingSession] New session created:', {
        sessionId: newSession.id,
        sessionName: newSession.name,
      });
      return newSession;
    },
    [currentTab, addSession, setCurrentSession, clearEvents],
  );

  // Create new session with form data
  const handleCreateSession = useCallback(
    async (values: {
      name: string;
      description?: string;
    }) => {
      console.log('[RecordingSession] Creating session with form data:', {
        name: values.name,
        description: values.description,
        url: currentTab?.url,
      });

      const newSession: RecordingSession = {
        id: `session-${Date.now()}`,
        name: values.name,
        description: values.description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        status: 'idle',
        url: currentTab?.url,
      };

      addSession(newSession);
      setCurrentSession(newSession.id);
      clearEvents();
      console.log('[RecordingSession] Session created and set as current:', {
        sessionId: newSession.id,
      });
      message.success(`Session "${values.name}" created successfully`);

      return newSession;
    },
    [currentTab, addSession, setCurrentSession, clearEvents],
  );

  // Update session
  const handleUpdateSession = useCallback(
    (sessionId: string, updates: Partial<RecordingSession>) => {
      console.log('[RecordingSession] Updating session:', {
        sessionId,
        updates: Object.keys(updates),
        hasEvents: !!updates.events?.length,
      });

      updateSession(sessionId, {
        ...updates,
        updatedAt: Date.now(),
      });
      message.success('Session updated successfully');
    },
    [updateSession],
  );

  // Delete session
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      console.log('[RecordingSession] Deleting session:', {
        sessionId,
        isCurrentSession: currentSessionId === sessionId,
      });

      deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        console.log(
          '[RecordingSession] Deleted session was current, clearing session and events',
        );
        setCurrentSession(null);
        clearEvents();
      }
      message.success('Session deleted successfully');
    },
    [deleteSession, currentSessionId, setCurrentSession, clearEvents],
  );

  // Select session (set as current)
  const handleSelectSession = useCallback(
    (session: RecordingSession) => {
      console.log('[RecordingSession] Selecting session as current:', {
        sessionId: session.id,
        sessionName: session.name,
        eventsCount: session.events.length,
      });

      setCurrentSession(session.id);
      message.success(`Switched to session "${session.name}"`);
    },
    [setCurrentSession],
  );

  // Export session events
  const handleExportSession = useCallback((session: RecordingSession) => {
    console.log('[RecordingSession] Exporting session:', {
      sessionId: session.id,
      sessionName: session.name,
      eventsCount: session.events.length,
    });

    if (session.events.length === 0) {
      console.warn('[RecordingSession] No events to export');
      message.warning('No events to export in this session');
      return;
    }
    exportEventsToFile(session.events, session.name);
  }, []);

  return {
    // State
    sessions,
    currentSessionId,
    getCurrentSession,

    // Actions
    createNewSession,
    handleCreateSession,
    handleUpdateSession,
    handleDeleteSession,
    handleSelectSession,
    handleExportSession,
  };
};
