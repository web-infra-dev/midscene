/// <reference types="chrome" />
import { PlusOutlined } from '@ant-design/icons';
import { Button, Form, Modal } from 'antd';
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
import { EnvConfig, useEnvConfig } from '@midscene/visualizer';
import { EnvConfigReminder } from '../../components';
import { generateDefaultSessionName } from './utils';

export default function Recorder() {
  // Local initialization state
  const [isStoreInitialized, setIsStoreInitialized] = useState(false);

  // Get stores
  const sessionStore = useRecordingSessionStore();
  const recordStore = useRecordStore();

  // Environment configuration check
  const { config } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;

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
    emergencySaveEvents,
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
    emergencySaveEvents, // Pass emergency save function
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
  };


  // View session detail handler
  const handleViewDetail = useCallback(
    (session: RecordingSession) => {
      recordLogger.info('Viewing session detail', { sessionId: session.id });

      setSelectedSession(session);
      setViewMode('detail');

    },
    [currentSessionId],
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
  const handleCreateNewSession = () => {
    const sessionName = generateDefaultSessionName();
    const newSession = createNewSession(sessionName);

    setTimeout(() => {
      startRecording(newSession.id);
    }, 300);

    // Switch to detail view
    setViewMode('detail');

    setSelectedSession(newSession);
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
      {/* Environment setup reminder */}
      <EnvConfigReminder />

      <RecordList
        sessions={sessions}
        currentSessionId={currentSessionId}
        onEditSession={handleEditSession}
        onDeleteSession={handleDeleteSessionWrapper}
        onExportSession={handleExportSession}
        onViewDetail={handleViewDetail}
        isExtensionMode={isExtensionMode}
      />

      {/* Floating Add Button */}
      {viewMode === 'list' && (
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<PlusOutlined />}
          onClick={handleCreateNewSession}
          className="!fixed bottom-5 right-5 w-14 h-14 shadow-lg 
       shadow-blue-500/40 z-[1000]"
        />
      )}

      {/* Recording Detail Modal */}
      <Modal
        open={viewMode === 'detail' && selectedSession !== null}
        onCancel={handleBackToList}
        footer={null}
        closable={false}
        width="100%"
        centered={false}
        className="recording-detail-modal"
        transitionName=""
        maskTransitionName=""
        styles={{
          body: {
            padding: 0,
            height: 'calc(100vh * 9 / 10)',
            overflow: 'hidden',
          },
          content: {
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 'calc(100vh * 9 / 10)',
            margin: 0,
            borderRadius: '16px 16px 0 0',
            maxWidth: 'none',
            width: '100%',
          },
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
        }}
      >
        {selectedSession && (
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
            onClose={handleBackToList}
          />
        )}
      </Modal>

      <SessionModals
        isEditModalVisible={isEditModalVisible}
        setIsEditModalVisible={setIsEditModalVisible}
        onUpdateSession={handleUpdateSessionWrapper}
        editForm={editForm}
        setEditingSession={setEditingSession}
      />
    </div>
  );
}
