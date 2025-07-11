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

  // Modal state management
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingSession, setEditingSession] = useState<RecordingSession | null>(
    null,
  );
  const [editForm] = Form.useForm();

  // Initialize tab monitoring to get currentTab
  const { currentTab } = useTabMonitoring();

  // Initialize recording session management with currentTab
  const sessionHooks = useRecordingSession(currentTab);
  const {
    sessions,
    currentSessionId,
    getCurrentSession,
    setCurrentSession,
    createNewSession,
    handleUpdateSession,
    handleDeleteSession,
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
      recordLogger.info('Viewing session detail', {
        sessionId: session.id,
        session,
      });
      setCurrentSession(session.id)
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

    setCurrentSession(newSession.id)
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
          className="!fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000] !h-[40px] !py-[12px] !px-[16px] !rounded-[48px]"
          // className="!fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000] flex items-center justify-center gap-[10px] text-[14px] text-white w-[172px] h-[40px] rounded-[48px] border py-[12px] px-[16px]"
          icon={<PlusOutlined className="stroke-[2]" />}
          onClick={handleCreateNewSession}
        >
          New Recording
        </Button>
      )}

      {/* Recording Detail Modal */}
      <Modal
        open={viewMode === 'detail' && currentSessionId !== null}
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
            // height: 'calc(100vh * 9 / 10)',
            margin: 0,
            borderRadius: '16px 16px 0 0',
            maxWidth: 'none',
            width: '100%',
            padding: '20px',
          },
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
        }}
      >
        {currentSessionId && (
          <RecordDetail
            key={currentSessionId}
            sessionId={currentSessionId}
            isRecording={isRecording}
            // events={events}
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
