import { message } from 'antd';
import { useCallback } from 'react';
import {
  type RecordingSession,
  useRecordStore,
  useRecordingSessionStore,
} from '../../../store';
import { recordLogger } from '../logger';
import { exportEventsToFile, exportAllEventsToZip, generateDefaultSessionName } from '../utils';

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

  const { clearEvents } = useRecordStore();

  // Create session utility function
  const createNewSession = useCallback(
    (sessionName?: string) => {
      const name = sessionName || generateDefaultSessionName();
      recordLogger.info('Creating new session', { action: 'create' });

      // Pause other active sessions
      sessions.forEach((session) => {
        if (session.status === 'recording') {
          updateSession(session.id, { status: 'idle' });
          recordLogger.info('Paused session', { sessionId: session.id });
        }
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

      recordLogger.success('Session created', { sessionId: newSession.id });
      return newSession;
    },
    [
      currentTab,
      addSession,
      setCurrentSession,
      clearEvents,
      sessions,
      updateSession,
    ],
  );

  // Create new session with form data
  const handleCreateSession = useCallback(
    async (values: {
      name: string;
      description?: string;
    }) => {
      recordLogger.info('Creating session with form data', {
        action: 'create',
      });

      // Pause other active sessions
      sessions.forEach((session) => {
        if (session.status === 'recording') {
          updateSession(session.id, { status: 'idle' });
          recordLogger.info('Paused session', { sessionId: session.id });
        }
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
      recordLogger.success('Session created from form', {
        sessionId: newSession.id,
      });
      return newSession;
    },
    [
      currentTab,
      addSession,
      setCurrentSession,
      clearEvents,
      sessions,
      updateSession,
    ],
  );

  // Update session
  const handleUpdateSession = useCallback(
    (sessionId: string, updates: Partial<RecordingSession>) => {
      recordLogger.info('Updating session', {
        sessionId,
        events: updates.events,
        eventsCount: updates.events?.length,
      });

      updateSession(sessionId, {
        ...updates,
        updatedAt: Date.now(),
      });
    },
    [updateSession],
  );

  // Delete session
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const isCurrentSession = currentSessionId === sessionId;
      recordLogger.info('Deleting session', {
        sessionId,
        action: isCurrentSession ? 'delete-current' : 'delete',
      });

      deleteSession(sessionId);
      if (isCurrentSession) {
        setCurrentSession(null);
        clearEvents();
      }
      // message.success('Session deleted successfully');
    },
    [deleteSession, currentSessionId, setCurrentSession, clearEvents],
  );

  // Select session (set as current)
  const handleSelectSession = useCallback(
    (session: RecordingSession) => {
      recordLogger.info('Selecting session', {
        sessionId: session.id,
        eventsCount: session.events.length,
      });

      setCurrentSession(session.id);
    },
    [setCurrentSession],
  );

  // Export session events
  const handleExportSession = useCallback((session: RecordingSession) => {
    if (session.events.length === 0) {
      recordLogger.warn('No events to export', { sessionId: session.id });
      message.warning('No events to export in this session');
      return;
    }

    recordLogger.info('Exporting session', {
      sessionId: session.id,
      eventsCount: session.events.length,
    });
    exportEventsToFile(session.events, session.name);
  }, []);

  // Export all sessions events to ZIP
  const handleExportAllEvents = useCallback(() => {
    recordLogger.info('Exporting all events', {
      sessionsCount: sessions.length,
    });
    exportAllEventsToZip(sessions);
  }, [sessions]);

  return {
    // State
    sessions,
    currentSessionId,
    getCurrentSession,
    setCurrentSession,

    // Actions
    createNewSession,
    handleCreateSession,
    handleUpdateSession,
    handleDeleteSession,
    handleSelectSession,
    handleExportSession,
    handleExportAllEvents,
  };
};
