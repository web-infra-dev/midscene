import type { ChromeRecordedEvent } from '@midscene/record';
import { message } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import { type RecordingSession, useRecordStore } from '../../../store';
import {
  clearDescriptionCache,
  optimizeEvent,
} from '../../../utils/eventOptimizer';
import { recordLogger } from '../logger';
import { type RecordMessage, isChromeExtension, safeChromeAPI } from '../types';
import {
  cleanupPreviousRecordings,
  ensureScriptInjected,
  exportEventsToFile,
  generateRecordTitle,
  generateSessionName,
} from '../utils';

/**
 * Hook to manage recording controls and handle recording events
 */
export const useRecordingControl = (
  currentTab: chrome.tabs.Tab | null,
  currentSessionId: string | null,
  getCurrentSession: () => RecordingSession | null,
  updateSession: (
    sessionId: string,
    updates: Partial<RecordingSession>,
  ) => void,
  createNewSession: (sessionName?: string) => RecordingSession,
  onSessionUpdated?: (session: RecordingSession) => void,
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
    recordLogger.info('Stopping recording', { sessionId: currentSessionId || undefined, tabId: currentTab?.id });

    if (!isExtensionMode) {
      setIsRecording(false);
      return;
    }

    if (!currentTab?.id) {
      recordLogger.error('No active tab found for stopping recording');
      message.error('No active tab found');
      return;
    }

    // Set isRecording to false immediately to prevent UI from showing recording state
    setIsRecording(false);

    try {
      // Check if content script is still available before sending message
      try {
        // Send message to content script to stop recording
        await safeChromeAPI.tabs.sendMessage(currentTab.id, {
          action: 'stop',
          sessionId: currentSessionId,
        });
        recordLogger.success('Recording stopped');
        message.success('Recording stopped');
      } catch (error: any) {
        // If content script is not available, just stop recording on our side
        if (error.message?.includes('Receiving end does not exist')) {
          recordLogger.warn('Content script not available during stop');
          message.warning('Recording stopped (page may have been refreshed)');
        } else {
          recordLogger.error('Error sending stop message', undefined, error);
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
          const updateData: Partial<RecordingSession> = {
            status: 'completed',
            events: [...events],
            duration,
            updatedAt: Date.now(),
          };

          // Generate AI title and description if we have events
          if (events.length > 3 && !session.name && !session.description) {
            recordLogger.info('Generating AI title', { eventsCount: events.length });
            const hideLoadingMessage = message.loading(
              'Generating recording title and description...',
              0,
            );
            try {
              const { title, description } = await generateRecordTitle(events);

              if (title) {
                updateData.name = title;
                recordLogger.success('AI title generated');
              }
              if (description) {
                updateData.description = description;
              }
            } catch (error) {
              recordLogger.error('Failed to generate title/description', undefined, error);
            } finally {
              hideLoadingMessage();
            }
          }

          updateSession(currentSessionId, updateData);
          message.success(
            `Recording saved to session "${updateData.name || session.name}"`,
          );

          // If this session is currently selected and displayed in the UI,
          // we need to manually update the UI to reflect the changes
          if (getCurrentSession()?.id === currentSessionId) {
            const updatedSession = getCurrentSession();
            // Notify any parent components about the session update via callback or ref
            if (updatedSession && onSessionUpdated) {
              onSessionUpdated(updatedSession);
            }
          }
        }
      }
    } catch (error) {
      recordLogger.error('Failed to stop recording', undefined, error);
      message.error(`Failed to stop recording: ${error}`);
      // Still stop recording on our side even if there was an error
      setIsRecording(false);
    }
  }, [
    isExtensionMode,
    currentTab,
    setIsRecording,
    currentSessionId,
    getCurrentSession,
    events,
    updateSession,
    onSessionUpdated,
  ]);

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
    recordLogger.info('Starting recording', { tabId: currentTab?.id });

    if (!isExtensionMode) {
      recordLogger.error('Not in extension environment');
      message.error(
        'Recording is only available in Chrome extension environment',
      );
      return;
    }

    // Check if there's a current session
    let sessionToUse = getCurrentSession();
    if (!sessionToUse) {
      // Auto-create session with timestamp name
      const sessionName = generateSessionName();
      recordLogger.info('Auto-creating session', { action: 'create' });

      sessionToUse = createNewSession(sessionName);
      message.success(`Session "${sessionName}" created automatically`);

      // Small delay to ensure state updates before continuing
      await new Promise((resolve) => setTimeout(resolve, 100));
    } else {
      recordLogger.info('Using existing session', { sessionId: sessionToUse.id });
    }

    // Update session status to recording
    updateSession(sessionToUse.id, {
      status: 'recording',
      url: currentTab?.url,
      updatedAt: Date.now(),
    });

    if (!currentTab?.id) {
      recordLogger.error('No active tab found for starting recording');
      message.error('No active tab found');
      return;
    }

    // Always ensure script is injected before starting
    await ensureScriptInjected(currentTab);

    try {
      // Clean up any previous recording instances first
      await cleanupPreviousRecordings();

      // Clear the AI description cache to avoid using old descriptions
      clearDescriptionCache();

      // Send message to content script to start recording
      await safeChromeAPI.tabs.sendMessage(currentTab.id, {
        action: 'start',
        sessionId: sessionToUse.id,
      });
      setIsRecording(true);
      clearEvents(); // Clear previous events for new recording
      recordLogger.success('Recording started', { sessionId: sessionToUse.id });
      message.success('Recording started');
    } catch (error) {
      recordLogger.error('Failed to start recording', undefined, error);
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
    clearEvents,
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
    recordLogger.info('Setting up message listener');

    // Connect to service worker for receiving events
    const port = safeChromeAPI.runtime.connect({ name: 'record-events' });

    // Note: onConnect is not available on Port objects, only on runtime
    // We can check port connection status indirectly

    if (
      'onDisconnect' in port &&
      typeof port.onDisconnect?.addListener === 'function'
    ) {
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          recordLogger.error('Port disconnect error', undefined, chrome.runtime.lastError);
        }
      });
    }

    const processEventData = async (eventData: any) => {
      const { element, ...cleanEventData } = eventData;
      return await optimizeEvent(
        cleanEventData as ChromeRecordedEvent,
        updateEvent,
      );
    };

    const handleMessage = async (message: RecordMessage) => {
      // Validate session ID - only process events from current recording session
      if (
        message.sessionId &&
        currentSessionId &&
        message.sessionId !== currentSessionId
      ) {
        return;
      }

      if (message.action === 'events' && Array.isArray(message.data)) {
        recordLogger.info('Processing bulk events', { eventsCount: message.data.length });
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
      } else {
        recordLogger.warn('Unhandled message format', { action: message.action });
      }
    };

    // Listen to messages via port
    port.onMessage.addListener(handleMessage);

    return () => {
      port.disconnect();
    };
  }, [addEvent, setEvents, updateEvent, currentSessionId]);

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
