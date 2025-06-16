/// <reference types="chrome" />
import { Form } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { RecordingSession } from '../../store';
import { useRecordStore, useRecordingSessionStore } from '../../store';
import { RecordDetail } from './components/RecordDetail';
import { RecordList } from './components/RecordList';
import { SessionModals } from './components/SessionModals';
import { useLifecycleCleanup } from './hooks/useLifecycleCleanup';
import { useRecordingControl } from './hooks/useRecordingControl';
import { useRecordingSession } from './hooks/useRecordingSession';
import { useTabMonitoring } from './hooks/useTabMonitoring';
import { recordLogger } from './logger';
import type { ViewMode } from './types';
import './recorder.less';

export default function Recorder() {
  // Local initialization state
  const [isStoreInitialized, setIsStoreInitialized] = useState(false);

  // Get stores
  const sessionStore = useRecordingSessionStore();
  const recordStore = useRecordStore();

  // Initialize stores on component mount
  useEffect(() => {
    let isMounted = true; // Prevent state updates after component unmount

    const initializeStores = async () => {
      try {
        // Initialize both stores concurrently
        await Promise.all([
          sessionStore.initializeStore(),
          recordStore.initialize(),
        ]);

        // Only update state if component is still mounted
        if (isMounted) {
          setIsStoreInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize stores in Recorder:', error);
        // Still set as initialized to prevent blocking the UI
        if (isMounted) {
          setIsStoreInitialized(true);
        }
      }
    };

    // Initialize only on first mount to avoid infinite loop
    initializeStores();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array, run only once on component mount

  // View state management
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSession, setSelectedSession] =
    useState<RecordingSession | null>(null);

  // Modal state management
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingSession, setEditingSession] = useState<RecordingSession | null>(
    null,
  );
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  // Initialize tab monitoring to get currentTab
  const { currentTab, checkRecordingRecovery } = useTabMonitoring();

  // Initialize recording session management with currentTab
  const sessionHooks = useRecordingSession(currentTab);
  const {
    sessions,
    currentSessionId,
    getCurrentSession,
    createNewSession,
    handleCreateSession,
    handleUpdateSession,
    handleDeleteSession,
    handleSelectSession,
    handleExportSession,
  } = sessionHooks;

  // Initialize recording control with currentTab
  const controlHooks = useRecordingControl(
    currentTab,
    currentSessionId,
    getCurrentSession,
    (sessionId: string, updates: Partial<RecordingSession>) => {
      sessionHooks.handleUpdateSession(sessionId, updates);
    },
    createNewSession,
    checkRecordingRecovery,
    handleSelectSession,
  );
  const {
    isRecording,
    events,
    isExtensionMode,
    recordContainerRef,
    startRecording,
    stopRecording,
    clearEvents,
    setIsRecording,
    setEvents,
  } = controlHooks;

  // Initialize lifecycle cleanup
  useLifecycleCleanup(
    isRecording,
    stopRecording,
    setIsRecording,
    currentSessionId,
    getCurrentSession,
    (sessionId: string, updates: Partial<RecordingSession>) => {
      sessionHooks.handleUpdateSession(sessionId, updates);
    },
    events, // Pass current events to save them during cleanup
  );

  // Load current session events when switching sessions
  useEffect(() => {
    const currentSession = getCurrentSession();
    if (currentSession && currentSession.events.length > 0) {
      setEvents(currentSession.events);
    } else {
      clearEvents();
    }
  }, [currentSessionId, getCurrentSession, setEvents, clearEvents]);

  // Sync selectedSession with currentSession for view management
  useEffect(() => {
    if (viewMode === 'detail' && currentSessionId) {
      const currentSession = getCurrentSession();
      if (
        currentSession &&
        (!selectedSession || selectedSession.id !== currentSessionId)
      ) {
        setSelectedSession(currentSession);
      }
    }
  }, [currentSessionId, getCurrentSession, selectedSession, viewMode]);

  // Edit session handler
  const handleEditSession = (session: RecordingSession) => {
    setEditingSession(session);
    editForm.setFieldsValue({
      name: session.name,
      description: session.description,
    });
    setIsEditModalVisible(true);
  };

  // Update session handler
  const handleUpdateSessionWrapper = async (values: {
    name: string;
    description?: string;
  }) => {
    if (!editingSession) return;

    handleUpdateSession(editingSession.id, {
      name: values.name,
      description: values.description,
    });

    // Update selectedSession if it's the one being edited
    if (selectedSession?.id === editingSession.id) {
      setSelectedSession({
        ...editingSession,
        name: values.name,
        description: values.description,
        updatedAt: Date.now(),
      });
    }

    setIsEditModalVisible(false);
    setEditingSession(null);
    editForm.resetFields();
  };

  // Delete session handler
  const handleDeleteSessionWrapper = (sessionId: string) => {
    handleDeleteSession(sessionId);
    // If we're viewing the deleted session, go back to list
    if (selectedSession?.id === sessionId) {
      setViewMode('list');
      setSelectedSession(null);
    }
  };

  // Select session handler with async handling
  const handleSelectSessionWrapper = useCallback(
    async (session: RecordingSession) => {
      recordLogger.info('Switching to session', { sessionId: session.id });

      // Stop current recording if any - wait for completion
      if (isRecording) {
        recordLogger.info(
          'Stopping current recording before switching session',
        );
        await stopRecording();
      }

      handleSelectSession(session);
    },
    [isRecording, stopRecording, handleSelectSession],
  );

  // View session detail handler
  const handleViewDetail = useCallback(
    (session: RecordingSession) => {
      recordLogger.info('Viewing session detail', { sessionId: session.id });

      setSelectedSession(session);
      setViewMode('detail');

      // If not already the current session, switch to it
      if (currentSessionId !== session.id) {
        recordLogger.info('Session not current, switching sessions');
        handleSelectSessionWrapper(session);
      }
    },
    [currentSessionId, handleSelectSessionWrapper],
  );

  // Go back to list view handler
  const handleBackToList = useCallback(async () => {
    recordLogger.info('Navigating back to list view');

    // Auto-stop recording when leaving detail view
    if (isRecording) {
      recordLogger.info('Auto-stopping recording when leaving detail view');
      await stopRecording();
    }

    setViewMode('list');
    setSelectedSession(null);
  }, [isRecording, stopRecording]);

  // Create session handler
  const handleCreateSessionWrapper = async (values: {
    name: string;
    description?: string;
  }) => {
    recordLogger.info('Creating new session', { action: 'create' });

    const newSession = await handleCreateSession(values);
    recordLogger.success('New session created', { sessionId: newSession.id });

    setIsCreateModalVisible(false);
    form.resetFields();

    // Switch to detail view for the new session
    setSelectedSession(newSession);
    setViewMode('detail');

    // Automatically start recording if in extension mode
    if (isExtensionMode && currentTab?.id) {
      recordLogger.info(
        'Auto-starting recording for new session in extension mode',
      );
      // Small delay to ensure UI updates first
      setTimeout(() => {
        startRecording();
      }, 100);
    }
  };

  // Show loading state while stores are initializing
  if (!isStoreInitialized) {
    return (
      <div
        className="popup-record-container"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
        }}
      >
        <div>Loading sessions...</div>
      </div>
    );
  }

  return (
    <div ref={recordContainerRef} className="popup-record-container">
      {viewMode === 'list' ? (
        <RecordList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onEditSession={handleEditSession}
          onDeleteSession={handleDeleteSessionWrapper}
          onSelectSession={handleSelectSessionWrapper}
          onExportSession={handleExportSession}
          onViewDetail={handleViewDetail}
          isExtensionMode={isExtensionMode}
          createNewSession={createNewSession}
          setSelectedSession={setSelectedSession}
          setViewMode={setViewMode}
          currentTab={currentTab}
          startRecording={startRecording}
        />
      ) : (
        selectedSession && (
          <RecordDetail
            sessionId={selectedSession.id}
            events={events}
            isRecording={isRecording}
            currentTab={currentTab}
            onBack={handleBackToList}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onClearEvents={clearEvents}
            isExtensionMode={isExtensionMode}
          />
        )
      )}

      <SessionModals
        isCreateModalVisible={isCreateModalVisible}
        setIsCreateModalVisible={setIsCreateModalVisible}
        onCreateSession={handleCreateSessionWrapper}
        createForm={form}
        isEditModalVisible={isEditModalVisible}
        setIsEditModalVisible={setIsEditModalVisible}
        onUpdateSession={handleUpdateSessionWrapper}
        editForm={editForm}
        editingSession={editingSession}
        setEditingSession={setEditingSession}
      />
    </div>
  );
}
