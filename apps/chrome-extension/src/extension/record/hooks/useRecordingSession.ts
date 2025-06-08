import { message } from 'antd';
import { useCallback } from 'react';
import {
  type RecordingSession,
  useRecordStore,
  useRecordingSessionStore,
} from '../../../store';
import { recordLogger } from '../logger';
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

  const { clearEvents } = useRecordStore();

  // Create session utility function
  const createNewSession = useCallback(
    (sessionName?: string) => {
      const name = sessionName || generateDefaultSessionName();
      recordLogger.info('Creating new session', { action: 'create' });

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
    [currentTab, addSession, setCurrentSession, clearEvents],
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
      message.success(`Session "${values.name}" created successfully`);

      return newSession;
    },
    [currentTab, addSession, setCurrentSession, clearEvents],
  );

  // Update session
  const handleUpdateSession = useCallback(
    (sessionId: string, updates: Partial<RecordingSession>) => {
      recordLogger.info('Updating session', {
        sessionId,
        eventsCount: updates.events?.length,
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
      message.success('Session deleted successfully');
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
      message.success(`Switched to session "${session.name}"`);
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
