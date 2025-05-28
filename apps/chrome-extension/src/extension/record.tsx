/// <reference types="chrome" />
import { DeleteOutlined, DownloadOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { RecordTimeline } from '@midscene/record';
import { Alert, Button, Divider, Space, message } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type RecordedEvent, useRecordStore } from '../store';
import './record.less';

// Message types for content script communication
interface RecordMessage {
    action: 'start' | 'stop' | 'event' | 'events';
    data?: RecordedEvent | RecordedEvent[];
}

export default function Record() {
    const { isRecording, events, setIsRecording, addEvent, clearEvents, setEvents } = useRecordStore();
    const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
    const [isInjected, setIsInjected] = useState(false);

    // Get current active tab
    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                setCurrentTab(tabs[0]);
            }
        });
    }, []);

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
                files: ['scripts/content-script-wrapper.js']
            });

            setIsInjected(true);
            message.success('Recording script injected successfully');
        } catch (error) {
            console.error('Failed to inject script:', error);
            message.error('Failed to inject recording script');
        }
    };

    // Start recording
    const startRecording = async () => {
        if (!currentTab?.id) {
            message.error('No active tab found');
            return;
        }

        if (!isInjected) {
            await injectScript();
        }

        try {
            // Send message to content script to start recording
            await chrome.tabs.sendMessage(currentTab.id, { action: 'start' });
            setIsRecording(true);
            clearEvents(); // Clear previous events
            message.success('Recording started');
        } catch (error) {
            console.error('Failed to start recording:', error);
            message.error('Failed to start recording. Please refresh the page and try again.');
        }
    };

    // Stop recording
    const stopRecording = async () => {
        if (!currentTab?.id) {
            message.error('No active tab found');
            return;
        }

        try {
            // Send message to content script to stop recording
            await chrome.tabs.sendMessage(currentTab.id, { action: 'stop' });
            setIsRecording(false);
            message.success('Recording stopped');
        } catch (error) {
            console.error('Failed to stop recording:', error);
            message.error('Failed to stop recording');
        }
    };

    // Export events
    const exportEvents = () => {
        if (events.length === 0) {
            message.warning('No events to export');
            return;
        }

        const dataStr = JSON.stringify(events, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `recording-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();

        URL.revokeObjectURL(url);
        message.success('Events exported successfully');
    };

    return (
        <div style={{ padding: '16px' }}>
            <Alert
                message="Event Recording"
                description="Record user interactions on the current tab. Events will be captured and displayed in real-time."
                type="info"
                style={{ marginBottom: '16px' }}
            />

            <div style={{ marginBottom: '16px' }}>
                <div className="current-tab-info">
                    Current Tab: {currentTab?.title || 'No tab selected'}
                </div>
                <Space className="record-controls">
                    {!isRecording ? (
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            onClick={startRecording}
                            disabled={!currentTab}
                        >
                            Start Recording
                        </Button>
                    ) : (
                        <Button
                            danger
                            icon={<StopOutlined />}
                            onClick={stopRecording}
                        >
                            Stop Recording
                        </Button>
                    )}

                    <Button
                        icon={<DeleteOutlined />}
                        onClick={clearEvents}
                        disabled={events.length === 0}
                    >
                        Clear Events
                    </Button>

                    <Button
                        icon={<DownloadOutlined />}
                        onClick={exportEvents}
                        disabled={events.length === 0}
                    >
                        Export
                    </Button>
                </Space>
            </div>

            <Divider />

            <div>
                <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
                    Recorded Events ({events.length})
                </div>
                <RecordTimeline events={events} />
            </div>
        </div>
    );
} 
