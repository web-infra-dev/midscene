/// <reference types="chrome" />
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { RecordTimeline } from '@midscene/record';
import { Alert, Button, Card, Divider, Empty, Form, Input, List, Modal, Popconfirm, Space, Tag, Typography, message } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type RecordedEvent, type RecordingSession, useRecordStore, useRecordingSessionStore } from '../store';
import './record.less';

const { Title, Text } = Typography;

// Message types for content script communication
interface RecordMessage {
    action: 'start' | 'stop' | 'event' | 'events';
    data?: RecordedEvent | RecordedEvent[];
}

// View modes
type ViewMode = 'list' | 'detail';

// Record List Component
const RecordList: React.FC<{
    sessions: RecordingSession[];
    currentSessionId: string | null;
    onCreateSession: () => void;
    onEditSession: (session: RecordingSession) => void;
    onDeleteSession: (sessionId: string) => void;
    onSelectSession: (session: RecordingSession) => void;
    onExportSession: (session: RecordingSession) => void;
    onViewDetail: (session: RecordingSession) => void;
}> = ({
    sessions,
    currentSessionId,
    onCreateSession,
    onEditSession,
    onDeleteSession,
    onSelectSession,
    onExportSession,
    onViewDetail
}) => {
        return (
            <div className="record-list-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <Title level={3} style={{ margin: 0 }}>Recording Sessions</Title>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={onCreateSession}
                    >
                        New Session
                    </Button>
                </div>

                {sessions.length === 0 ? (
                    <div className="session-empty">
                        <Empty
                            description="No recording sessions yet"
                            style={{ margin: '40px 0' }}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={onCreateSession}
                            >
                                Create First Session
                            </Button>
                        </Empty>
                    </div>
                ) : (
                    <List
                        className="session-list"
                        grid={{ gutter: 16, column: 1 }}
                        dataSource={sessions}
                        renderItem={(session) => (
                            <List.Item>
                                <Card
                                    size="small"
                                    className={session.id === currentSessionId ? 'selected-session' : ''}
                                    style={{
                                        cursor: 'pointer',
                                        border: session.id === currentSessionId ? '2px solid #1890ff' : '1px solid #d9d9d9'
                                    }}
                                    onClick={() => onViewDetail(session)}
                                    actions={[
                                        <Button
                                            key="select"
                                            type="text"
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectSession(session);
                                            }}
                                            style={{ color: session.id === currentSessionId ? '#1890ff' : undefined }}
                                        >
                                            {session.id === currentSessionId ? 'Selected' : 'Select'}
                                        </Button>,
                                        <Button
                                            key="edit"
                                            type="text"
                                            icon={<EditOutlined />}
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditSession(session);
                                            }}
                                        />,
                                        <Button
                                            key="download"
                                            type="text"
                                            icon={<DownloadOutlined />}
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onExportSession(session);
                                            }}
                                            disabled={session.events.length === 0}
                                        />,
                                        <Popconfirm
                                            key="delete"
                                            title="Delete session"
                                            description="Are you sure you want to delete this session?"
                                            onConfirm={(e) => {
                                                e?.stopPropagation();
                                                onDeleteSession(session.id);
                                            }}
                                            onCancel={(e) => e?.stopPropagation()}
                                        >
                                            <Button
                                                type="text"
                                                danger
                                                icon={<DeleteOutlined />}
                                                size="small"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </Popconfirm>
                                    ]}
                                >
                                    <Card.Meta
                                        title={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{session.name}</span>
                                                <Space>
                                                    <Tag color={session.status === 'recording' ? 'red' : session.status === 'completed' ? 'green' : 'default'}>
                                                        {session.status}
                                                    </Tag>
                                                    {session.id === currentSessionId && (
                                                        <Tag color="blue">Current</Tag>
                                                    )}
                                                </Space>
                                            </div>
                                        }
                                        description={
                                            <div className="session-meta">
                                                {session.description && <div style={{ marginBottom: '4px' }}>{session.description}</div>}
                                                <div className="session-details">
                                                    Events: {session.events.length} |
                                                    Created: {new Date(session.createdAt).toLocaleString()} |
                                                    {session.duration && ` Duration: ${(session.duration / 1000).toFixed(1)}s |`}
                                                    {session.url && ` URL: ${session.url.slice(0, 50)}${session.url.length > 50 ? '...' : ''}`}
                                                </div>
                                            </div>
                                        }
                                    />
                                </Card>
                            </List.Item>
                        )}
                    />
                )}
            </div>
        );
    };

// Record Detail Component
const RecordDetail: React.FC<{
    session: RecordingSession;
    events: RecordedEvent[];
    isRecording: boolean;
    currentTab: chrome.tabs.Tab | null;
    onBack: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onClearEvents: () => void;
    onExportEvents: () => void;
}> = ({
    session,
    events,
    isRecording,
    currentTab,
    onBack,
    onStartRecording,
    onStopRecording,
    onClearEvents,
    onExportEvents
}) => {
        return (
            <div className="record-detail-view">
                {/* Header with back button and session info */}
                <div className="detail-header">
                    <Button
                        type="text"
                        icon={<ArrowLeftOutlined />}
                        onClick={onBack}
                        className="back-button"
                    >
                        Back to Sessions
                    </Button>
                    <div className="session-title">
                        <Title level={4}>{session.name}</Title>
                        <Text type="secondary">{session.description}</Text>
                    </div>
                </div>

                {/* Recording Status Indicator */}
                <div className={`recording-status ${isRecording ? 'recording' : 'idle'}`}>
                    {isRecording ? (
                        <span>🔴 Recording in progress</span>
                    ) : (
                        <span>✅ Ready to record</span>
                    )}
                </div>

                {/* Session Details */}
                <Card size="small" className="session-info-card">
                    <div className="session-info">
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                            <div>
                                <Text strong>Status: </Text>
                                <Tag color={session.status === 'recording' ? 'red' : session.status === 'completed' ? 'green' : 'default'}>
                                    {session.status}
                                </Tag>
                            </div>
                            <div>
                                <Text strong>Events: </Text>
                                <Text>{session.events.length}</Text>
                            </div>
                            <div>
                                <Text strong>Created: </Text>
                                <Text>{new Date(session.createdAt).toLocaleString()}</Text>
                            </div>
                            {session.duration && (
                                <div>
                                    <Text strong>Duration: </Text>
                                    <Text>{(session.duration / 1000).toFixed(1)}s</Text>
                                </div>
                            )}
                            {session.url && (
                                <div>
                                    <Text strong>URL: </Text>
                                    <Text>{session.url}</Text>
                                </div>
                            )}
                        </Space>
                    </div>
                </Card>

                {/* Recording Controls */}
                <div className="controls-section">
                    <div className="current-tab-info">
                        <Text strong>Current Tab:</Text> {currentTab?.title || 'No tab selected'}
                    </div>
                    <Space className="record-controls">
                        {!isRecording ? (
                            <Button
                                type="primary"
                                icon={<PlayCircleOutlined />}
                                onClick={onStartRecording}
                                disabled={!currentTab}
                            >
                                Start Recording
                            </Button>
                        ) : (
                            <Button
                                danger
                                icon={<StopOutlined />}
                                onClick={onStopRecording}
                            >
                                Stop Recording
                            </Button>
                        )}

                        <Button
                            icon={<DeleteOutlined />}
                            onClick={onClearEvents}
                            disabled={events.length === 0 || isRecording}
                        >
                            Clear Events
                        </Button>

                        <Button
                            icon={<DownloadOutlined />}
                            onClick={onExportEvents}
                            disabled={events.length === 0}
                        >
                            Export Events
                        </Button>
                    </Space>
                </div>

                <Divider />

                {/* Events Display */}
                <div className="events-section">
                    <div className="events-header">
                        <Title level={5}>
                            Recorded Events ({events.length})
                        </Title>
                    </div>
                    <div className={`events-container ${events.length === 0 ? 'empty' : ''}`}>
                        {events.length === 0 ? (
                            <Empty description="No events recorded yet" />
                        ) : (
                            <RecordTimeline events={events} />
                        )}
                    </div>
                </div>
            </div>
        );
    };

export default function Record() {
    const { isRecording, events, setIsRecording, addEvent, clearEvents, setEvents } = useRecordStore();
    const {
        sessions,
        currentSessionId,
        addSession,
        updateSession,
        deleteSession,
        setCurrentSession,
        getCurrentSession
    } = useRecordingSessionStore();

    // View state management
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedSession, setSelectedSession] = useState<RecordingSession | null>(null);

    const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
    const [isInjected, setIsInjected] = useState(false);
    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editingSession, setEditingSession] = useState<RecordingSession | null>(null);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    // Get current active tab
    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                setCurrentTab(tabs[0]);
            }
        });
    }, []);

    // Load current session events when switching sessions
    useEffect(() => {
        const currentSession = getCurrentSession();
        if (currentSession && currentSession.events.length > 0) {
            setEvents(currentSession.events);
        } else {
            clearEvents();
        }
    }, [currentSessionId, getCurrentSession, setEvents, clearEvents]);

    // Monitor tab updates (refresh, navigation, etc.)
    useEffect(() => {
        const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (currentTab?.id === tabId && changeInfo.status === 'loading' && isRecording) {
                // Page is being refreshed or navigating away
                setIsRecording(false);
                setIsInjected(false);
                message.warning('Recording stopped due to page refresh/navigation');
            }
        };

        chrome.tabs.onUpdated.addListener(handleTabUpdate);

        return () => chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    }, [currentTab, isRecording, setIsRecording]);

    // Set up message listener for content script
    useEffect(() => {
        // Connect to service worker for receiving events
        const port = chrome.runtime.connect({ name: 'record-events' });

        const handleMessage = (message: RecordMessage) => {
            console.log('Received message:', message);

            if (message.action === 'events' && message.data) {
                if (Array.isArray(message.data)) {
                    // Handle batch events update
                    const eventsData = message.data.map(event => {
                        const { element, ...eventData } = event;
                        return eventData as RecordedEvent;
                    });
                    setEvents(eventsData);
                }
            } else if (message.action === 'event' && message.data && !Array.isArray(message.data)) {
                // Filter out the element property as it can't be serialized
                const { element, ...eventData } = message.data;
                addEvent(eventData as RecordedEvent);
            }
        };

        // Listen to messages via port
        port.onMessage.addListener(handleMessage);

        // Also keep the original listener for other messages
        const messageListener = (
            message: RecordMessage,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: any) => void
        ) => {
            console.log('Received message:', message);
            if (message.action === 'event' && message.data && !Array.isArray(message.data)) {
                // Filter out the element property as it can't be serialized
                const { element, ...eventData } = message.data;
                addEvent(eventData as RecordedEvent);
            } else if (message.action === 'events' && message.data && Array.isArray(message.data)) {
                // Handle batch events update
                const eventsData = message.data.map(event => {
                    const { element, ...eventData } = event;
                    return eventData as RecordedEvent;
                });
                setEvents(eventsData);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        return () => {
            port.disconnect();
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, [addEvent, setEvents]);

    // Check if content script is injected
    const checkContentScriptInjected = async (tabId: number): Promise<boolean> => {
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return response?.success === true;
        } catch (error) {
            return false;
        }
    };

    // Re-inject script if needed
    const ensureScriptInjected = async () => {
        if (!currentTab?.id) return false;

        const isInjected = await checkContentScriptInjected(currentTab.id);
        if (!isInjected) {
            await injectScript();
        }
        return true;
    };

    // Inject content script
    const injectScript = async () => {
        if (!currentTab?.id) {
            message.error('No active tab found');
            return;
        }

        try {
            console.log('injecting record script');
            // Inject the record script first
            await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['scripts/record-iife.js']
            });

            // Then inject the content script wrapper
            await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['scripts/event-recorder-bridge.js']
            });

            setIsInjected(true);
            message.success('Recording script injected successfully');
        } catch (error) {
            console.error('Failed to inject script:', error);
            if (error instanceof Error && error.message.includes('Cannot access')) {
                message.error('Cannot inject script on this page (Chrome internal pages are restricted)');
            } else if (error instanceof Error && error.message.includes('chrome-extension://')) {
                message.error('Cannot inject script on Chrome extension pages');
            } else if (error instanceof Error && error.message.includes('chrome://')) {
                message.error('Cannot inject script on Chrome system pages');
            } else {
                message.error(`Failed to inject recording script: ${error}`);
            }
        }
    };

    // Create new session
    const handleCreateSession = async (values: { name: string; description?: string }) => {
        const newSession: RecordingSession = {
            id: `session-${Date.now()}`,
            name: values.name,
            description: values.description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            events: [],
            status: 'idle',
            url: currentTab?.url
        };

        addSession(newSession);
        setCurrentSession(newSession.id);
        clearEvents();
        setIsCreateModalVisible(false);
        form.resetFields();
        message.success(`Session "${values.name}" created successfully`);

        // Switch to detail view for the new session
        setSelectedSession(newSession);
        setViewMode('detail');
    };

    // Edit session
    const handleEditSession = (session: RecordingSession) => {
        setEditingSession(session);
        editForm.setFieldsValue({
            name: session.name,
            description: session.description
        });
        setIsEditModalVisible(true);
    };

    // Update session
    const handleUpdateSession = async (values: { name: string; description?: string }) => {
        if (!editingSession) return;

        updateSession(editingSession.id, {
            name: values.name,
            description: values.description,
            updatedAt: Date.now()
        });

        // Update selectedSession if it's the one being edited
        if (selectedSession?.id === editingSession.id) {
            setSelectedSession({
                ...editingSession,
                name: values.name,
                description: values.description,
                updatedAt: Date.now()
            });
        }

        setIsEditModalVisible(false);
        setEditingSession(null);
        editForm.resetFields();
        message.success('Session updated successfully');
    };

    // Delete session
    const handleDeleteSession = (sessionId: string) => {
        deleteSession(sessionId);
        if (currentSessionId === sessionId) {
            setCurrentSession(null);
            clearEvents();
        }
        // If we're viewing the deleted session, go back to list
        if (selectedSession?.id === sessionId) {
            setViewMode('list');
            setSelectedSession(null);
        }
        message.success('Session deleted successfully');
    };

    // Select session (set as current)
    const handleSelectSession = (session: RecordingSession) => {
        // Stop current recording if any
        if (isRecording) {
            stopRecording();
        }

        setCurrentSession(session.id);
        // Load session events
        if (session.events.length > 0) {
            setEvents(session.events);
        } else {
            clearEvents();
        }
        message.success(`Switched to session "${session.name}"`);
    };

    // View session detail
    const handleViewDetail = (session: RecordingSession) => {
        setSelectedSession(session);
        setViewMode('detail');

        // If not already the current session, switch to it
        if (currentSessionId !== session.id) {
            handleSelectSession(session);
        }
    };

    // Go back to list view
    const handleBackToList = () => {
        setViewMode('list');
        setSelectedSession(null);
    };

    // Start recording
    const startRecording = async () => {
        // Check if there's a current session
        if (!currentSessionId) {
            message.warning('Please create or select a recording session first');
            setIsCreateModalVisible(true);
            return;
        }

        const currentSession = getCurrentSession();
        if (!currentSession) {
            message.error('Session not found');
            return;
        }

        // Update session status to recording
        updateSession(currentSessionId, {
            status: 'recording',
            url: currentTab?.url,
            updatedAt: Date.now()
        });

        if (!currentTab?.id) {
            message.error('No active tab found');
            return;
        }

        // Always ensure script is injected before starting
        await ensureScriptInjected();

        try {
            // Send message to content script to start recording
            await chrome.tabs.sendMessage(currentTab.id, { action: 'start' });
            setIsRecording(true);
            clearEvents(); // Clear previous events for new recording
            message.success('Recording started');
        } catch (error) {
            console.error('Failed to start recording:', error);
            message.error('Failed to start recording. Please ensure you are on a regular web page (not Chrome internal pages) and try again.');
        }
    };

    // Stop recording
    const stopRecording = async () => {
        if (!currentTab?.id) {
            message.error('No active tab found');
            return;
        }

        try {
            // Check if content script is still available before sending message
            try {
                // Send message to content script to stop recording
                await chrome.tabs.sendMessage(currentTab.id, { action: 'stop' });
                message.success('Recording stopped');
            } catch (error: any) {
                // If content script is not available, just stop recording on our side
                if (error.message?.includes('Receiving end does not exist')) {
                    console.warn('Content script not available, stopping recording locally');
                    message.warning('Recording stopped (page may have been refreshed)');
                } else {
                    throw error;
                }
            }

            // Always set recording to false regardless of content script status
            setIsRecording(false);

            // Update session with final events and status
            if (currentSessionId) {
                const session = getCurrentSession();
                if (session) {
                    const duration = events.length > 0
                        ? events[events.length - 1].timestamp - events[0].timestamp
                        : 0;
                    updateSession(currentSessionId, {
                        status: 'completed',
                        events: [...events],
                        duration,
                        updatedAt: Date.now()
                    });

                    // Update selectedSession if it's the current one
                    if (selectedSession?.id === currentSessionId) {
                        setSelectedSession({
                            ...selectedSession,
                            status: 'completed',
                            events: [...events],
                            duration,
                            updatedAt: Date.now()
                        });
                    }

                    message.success(`Recording saved to session "${session.name}"`);
                }
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
            message.error(`Failed to stop recording: ${error}`);
            // Still stop recording on our side even if there was an error
            setIsRecording(false);
        }
    };

    // Export session events
    const exportSessionEvents = (session: RecordingSession) => {
        if (session.events.length === 0) {
            message.warning('No events to export in this session');
            return;
        }

        const dataStr = JSON.stringify(session.events, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${session.name}-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();

        URL.revokeObjectURL(url);
        message.success(`Events from "${session.name}" exported successfully`);
    };

    // Export current events
    const exportEvents = () => {
        if (events.length === 0) {
            message.warning('No events to export');
            return;
        }

        const currentSession = getCurrentSession();
        const sessionName = currentSession ? currentSession.name : 'current-recording';

        const dataStr = JSON.stringify(events, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${sessionName}-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();

        URL.revokeObjectURL(url);
        message.success('Events exported successfully');
    };

    return (
        <div className="popup-record-container">
            {viewMode === 'list' ? (
                <RecordList
                    sessions={sessions}
                    currentSessionId={currentSessionId}
                    onCreateSession={() => setIsCreateModalVisible(true)}
                    onEditSession={handleEditSession}
                    onDeleteSession={handleDeleteSession}
                    onSelectSession={handleSelectSession}
                    onExportSession={exportSessionEvents}
                    onViewDetail={handleViewDetail}
                />
            ) : (
                selectedSession && (
                    <RecordDetail
                        session={selectedSession}
                        events={events}
                        isRecording={isRecording}
                        currentTab={currentTab}
                        onBack={handleBackToList}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
                        onClearEvents={clearEvents}
                        onExportEvents={exportEvents}
                    />
                )
            )}

            {/* Create Session Modal */}
            <Modal
                title="Create New Recording Session"
                open={isCreateModalVisible}
                onCancel={() => {
                    setIsCreateModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                className="session-modal"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleCreateSession}
                >
                    <Form.Item
                        name="name"
                        label="Session Name"
                        rules={[{ required: true, message: 'Please enter a session name' }]}
                    >
                        <Input placeholder="Enter session name" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Description (Optional)"
                    >
                        <Input.TextArea
                            placeholder="Enter session description"
                            rows={3}
                        />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => {
                                setIsCreateModalVisible(false);
                                form.resetFields();
                            }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit">
                                Create Session
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Edit Session Modal */}
            <Modal
                title="Edit Recording Session"
                open={isEditModalVisible}
                onCancel={() => {
                    setIsEditModalVisible(false);
                    setEditingSession(null);
                    editForm.resetFields();
                }}
                footer={null}
                className="session-modal"
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleUpdateSession}
                >
                    <Form.Item
                        name="name"
                        label="Session Name"
                        rules={[{ required: true, message: 'Please enter a session name' }]}
                    >
                        <Input placeholder="Enter session name" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Description (Optional)"
                    >
                        <Input.TextArea
                            placeholder="Enter session description"
                            rows={3}
                        />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => {
                                setIsEditModalVisible(false);
                                setEditingSession(null);
                                editForm.resetFields();
                            }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit">
                                Update Session
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
} 
