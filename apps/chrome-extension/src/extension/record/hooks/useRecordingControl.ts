import { useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import {
  type RecordedEvent,
  type RecordingSession,
  useRecordStore,
  useRecordingSessionStore,
} from '../../../store';
import { clearDescriptionCache, optimizeEvent } from '../../../utils/eventOptimizer';
import { 
  safeChromeAPI, 
  isChromeExtension,
  type RecordMessage
} from '../types';
import { ensureScriptInjected, exportEventsToFile, generateRecordTitle } from '../utils';

export const useRecordingControl = (
  currentTab: chrome.tabs.Tab | null,
  currentSessionId: string | null,
  getCurrentSession: () => RecordingSession | null,
  updateSession: (sessionId: string, updates: Partial<RecordingSession>) => void,
  createNewSession: (sessionName?: string) => RecordingSession
) => {
  const {
    isRecording,
    events,
    setIsRecording,
    addEvent,
    updateEvent,
    clearEvents,
    setEvents,
  } = useRecordStore();

  const isExtensionMode = isChromeExtension();
  const recordContainerRef = useRef<HTMLDivElement>(null);

  // Define stopRecording early using useCallback
  const stopRecording = useCallback(async () => {
    if (!isExtensionMode) {
      setIsRecording(false);
      return;
    }

    if (!currentTab?.id) {
      message.error('No active tab found');
      return;
    }

    // Set isRecording to false immediately to prevent UI from showing recording state
    setIsRecording(false);

    try {
      // Check if content script is still available before sending message
      try {
        // Send message to content script to stop recording
        await safeChromeAPI.tabs.sendMessage(currentTab.id, { action: 'stop' });
        message.success('Recording stopped');
      } catch (error: any) {
        // If content script is not available, just stop recording on our side
        if (error.message?.includes('Receiving end does not exist')) {
          console.warn(
            'Content script not available, stopping recording locally',
          );
          message.warning('Recording stopped (page may have been refreshed)');
        } else {
          throw error;
        }
      }

      // Update session with final events and status
      if (currentSessionId) {
        const session = getCurrentSession();
        if (session) {
          const duration =
            events.length > 0
              ? events[events.length - 1].timestamp - events[0].timestamp
              : 0;
          
          // Generate title and description if we have events
          let updateData: Partial<RecordingSession> = {
            status: 'completed',
            events: [...events],
            duration,
            updatedAt: Date.now(),
          };
          
          // Generate AI title and description if we have events
          if (events.length > 0) {
            message.loading('Generating recording title and description...', 1);
            try {
              const { title, description } = await generateRecordTitle(events);
              if (title) {
                updateData.name = title;
              }
              if (description) {
                updateData.description = description;
              }
            } catch (error) {
              console.error('Failed to generate title/description:', error);
            }
          }
          
          updateSession(currentSessionId, updateData);
          message.success(`Recording saved to session "${updateData.name || session.name}"`);
        }
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      message.error(`Failed to stop recording: ${error}`);
      // Still stop recording on our side even if there was an error
      setIsRecording(false);
    }
  }, [isExtensionMode, currentTab, setIsRecording, currentSessionId, getCurrentSession, events, updateSession]);

  // Monitor tab updates for page refresh/navigation detection
  useEffect(() => {
    if (!currentTab?.id || !isRecording) return;

    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (
        currentTab?.id === tabId &&
        changeInfo.status === 'loading' &&
        isRecording
      ) {
        // Page is being refreshed or navigating away
        stopRecording().then(() => {
          message.warning('Recording stopped due to page refresh/navigation');
        });
      }
    };

    safeChromeAPI.tabs.onUpdated.addListener(handleTabUpdate);

    return () => safeChromeAPI.tabs.onUpdated.removeListener(handleTabUpdate);
  }, [currentTab, isRecording, stopRecording]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!isExtensionMode) {
      message.error(
        'Recording is only available in Chrome extension environment',
      );
      return;
    }

    // Check if there's a current session
    let sessionToUse = getCurrentSession();
    if (!sessionToUse) {
      // Auto-create session with timestamp name
      const sessionName = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\//g, '-');
      
      sessionToUse = createNewSession(sessionName);
      message.success(`Session "${sessionName}" created automatically`);

      // Small delay to ensure state updates before continuing
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Update session status to recording
    updateSession(sessionToUse.id, {
      status: 'recording',
      url: currentTab?.url,
      updatedAt: Date.now(),
    });

    if (!currentTab?.id) {
      message.error('No active tab found');
      return;
    }

    // Always ensure script is injected before starting
    await ensureScriptInjected(currentTab);

    try {
      // Clear the AI description cache to avoid using old descriptions
      clearDescriptionCache();

      // Send message to content script to start recording
      await safeChromeAPI.tabs.sendMessage(currentTab.id, { action: 'start' });
      setIsRecording(true);
      clearEvents(); // Clear previous events for new recording
      message.success('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      message.error(
        'Failed to start recording. Please ensure you are on a regular web page (not Chrome internal pages) and try again.',
      );
    }
  }, [
    isExtensionMode,
    getCurrentSession,
    createNewSession,
    updateSession,
    currentTab,
    setIsRecording,
    clearEvents
  ]);

  // Export current events
  const exportEvents = useCallback(() => {
    if (events.length === 0) {
      message.warning('No events to export');
      return;
    }

    const currentSession = getCurrentSession();
    const sessionName = currentSession
      ? currentSession.name
      : 'current-recording';

    exportEventsToFile(events, sessionName);
  }, [events, getCurrentSession]);

  // Auto-scroll to bottom when new events are added during recording
  useEffect(() => {
    if (isRecording && recordContainerRef.current && events.length > 0) {
      const container = recordContainerRef.current;

      // Use requestAnimationFrame for smoother animation
      const smoothScrollToBottom = () => {
        const targetScrollTop = container.scrollHeight - container.clientHeight;
        const currentScrollTop = container.scrollTop;
        const distance = targetScrollTop - currentScrollTop;

        if (Math.abs(distance) < 1) {
          container.scrollTop = targetScrollTop;
          return;
        }

        // Smooth scroll animation
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        });
      };

      // Use multiple RAF to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(smoothScrollToBottom);
      });
    }
  }, [events.length, isRecording]);

  // Set up message listener for content script
  useEffect(() => {
    // Connect to service worker for receiving events
    const port = safeChromeAPI.runtime.connect({ name: 'record-events' });

    const processEventData = async (eventData: any) => {
      const { element, ...cleanEventData } = eventData;
      return await optimizeEvent(cleanEventData as RecordedEvent, updateEvent);
    };

    const handleMessage = async (message: RecordMessage) => {
      console.log('Received message:', message);

      if (message.action === 'events' && Array.isArray(message.data)) {
        const eventsData = await Promise.all(
          message.data.map(processEventData),
        );
        setEvents(eventsData);
      } else if (
        message.action === 'event' &&
        message.data &&
        !Array.isArray(message.data)
      ) {
        const optimizedEvent = await processEventData(message.data);
        addEvent(optimizedEvent);
      }
    };

    // Listen to messages via port
    port.onMessage.addListener(handleMessage);

    return () => {
      port.disconnect();
    };
  }, [addEvent, setEvents, updateEvent]);

  return {
    // State
    isRecording,
    events,
    isExtensionMode,
    recordContainerRef,
    
    // Actions
    startRecording,
    stopRecording,
    clearEvents,
    exportEvents,
    setIsRecording,
    setEvents,
  };
}; 