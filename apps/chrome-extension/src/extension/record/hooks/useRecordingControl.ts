import type { ChromeRecordedEvent } from '@midscene/record';
import { message } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import { type RecordingSession, useRecordStore } from '../../../store';
import {
  clearDescriptionCache,
  optimizeEvent,
} from '../../../utils/eventOptimizer';
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
    console.log('[RecordingControl] Stopping recording');

    if (!isExtensionMode) {
      console.log('[RecordingControl] Not in extension mode, stopping locally');
      setIsRecording(false);
      return;
    }

    if (!currentTab?.id) {
      console.error(
        '[RecordingControl] No active tab found for stopping recording',
      );
      message.error('No active tab found');
      return;
    }

    // Set isRecording to false immediately to prevent UI from showing recording state
    setIsRecording(false);
    console.log('[RecordingControl] Set recording state to false');

    try {
      // Check if content script is still available before sending message
      try {
        // Send message to content script to stop recording
        console.log(
          '[RecordingControl] Sending stop message to content script',
        );
        await safeChromeAPI.tabs.sendMessage(currentTab.id, {
          action: 'stop',
          sessionId: currentSessionId,
        });
        console.log('[RecordingControl] Stop message sent successfully');
        message.success('Recording stopped');
      } catch (error: any) {
        // If content script is not available, just stop recording on our side
        if (error.message?.includes('Receiving end does not exist')) {
          console.log(
            '[RecordingControl] Content script not available, stopping recording locally',
          );
          message.warning('Recording stopped (page may have been refreshed)');
        } else {
          console.log('[RecordingControl] Error sending stop message:', error);
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
            console.log(
              '[RecordingControl] Generating AI title and description for',
              events.length,
              'events',
            );
            const hideLoadingMessage = message.loading(
              'Generating recording title and description...',
              0,
            );
            try {
              const { title, description } = await generateRecordTitle(events);

              console.log('[RecordingControl] Generated AI:', {
                title,
                description,
              });
              if (title) {
                updateData.name = title;
              }
              if (description) {
                updateData.description = description;
              }
            } catch (error) {
              console.error(
                '[RecordingControl] Failed to generate title/description:',
                error,
              );
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
      console.error('Failed to stop recording:', error);
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
    console.log('[RecordingControl] Starting recording');

    if (!isExtensionMode) {
      console.error('[RecordingControl] Not in extension environment');
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
      console.log('[RecordingControl] Auto-creating session:', sessionName);

      sessionToUse = createNewSession(sessionName);
      message.success(`Session "${sessionName}" created automatically`);

      // Small delay to ensure state updates before continuing
      await new Promise((resolve) => setTimeout(resolve, 100));
    } else {
      console.log('[RecordingControl] Using existing session:', {
        sessionId: sessionToUse.id,
        sessionName: sessionToUse.name,
      });
    }

    // Update session status to recording
    updateSession(sessionToUse.id, {
      status: 'recording',
      url: currentTab?.url,
      updatedAt: Date.now(),
    });

    if (!currentTab?.id) {
      console.error(
        '[RecordingControl] No active tab found for starting recording',
      );
      message.error('No active tab found');
      return;
    }

    console.log('[RecordingControl] Injecting recording script');
    // Always ensure script is injected before starting
    await ensureScriptInjected(currentTab);

    try {
      // Clean up any previous recording instances first
      console.log(
        '[RecordingControl] Cleaning up previous recording instances',
      );
      await cleanupPreviousRecordings();

      // Clear the AI description cache to avoid using old descriptions
      console.log('[RecordingControl] Clearing AI description cache');
      clearDescriptionCache();

      // Send message to content script to start recording
      console.log('[RecordingControl] Sending start message to content script');
      await safeChromeAPI.tabs.sendMessage(currentTab.id, {
        action: 'start',
        sessionId: sessionToUse.id,
      });
      setIsRecording(true);
      clearEvents(); // Clear previous events for new recording
      console.log(
        '[RecordingControl] Recording started successfully with session ID:',
        sessionToUse.id,
      );
      message.success('Recording started');
    } catch (error) {
      console.error('[RecordingControl] Failed to start recording:', error);
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
    console.log(
      '[RecordingControl] Setting up message listener for recording events',
    );

    // Connect to service worker for receiving events
    const port = safeChromeAPI.runtime.connect({ name: 'record-events' });
    console.log('[RecordingControl] Connected to service worker port');

    // Note: onConnect is not available on Port objects, only on runtime
    // We can check port connection status indirectly

    if (
      'onDisconnect' in port &&
      typeof port.onDisconnect?.addListener === 'function'
    ) {
      port.onDisconnect.addListener(() => {
        console.log('[RecordingControl] Port disconnected');
        if (chrome.runtime.lastError) {
          console.error(
            '[RecordingControl] Port disconnect error:',
            chrome.runtime.lastError,
          );
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
      console.log('[RecordingControl] Received message from service worker:', {
        action: message.action,
        data: message.data,
        dataType: Array.isArray(message.data) ? 'array' : typeof message.data,
        dataLength: Array.isArray(message.data) ? message.data.length : 1,
        sessionId: message.sessionId,
      });

      // Validate session ID - only process events from current recording session
      if (
        message.sessionId &&
        currentSessionId &&
        message.sessionId !== currentSessionId
      ) {
        console.log(
          '[RecordingControl] Ignoring event from previous session:',
          {
            messageSessionId: message.sessionId,
            currentSessionId: currentSessionId,
          },
        );
        return;
      }

      if (message.action === 'events' && Array.isArray(message.data)) {
        console.log(
          '[RecordingControl] Processing bulk events:',
          message.data.length,
        );
        const eventsData = await Promise.all(
          message.data.map(processEventData),
        );
        setEvents(eventsData);
      } else if (
        message.action === 'event' &&
        message.data &&
        !Array.isArray(message.data)
      ) {
        console.log(
          '[RecordingControl] Processing single event:',
          message.data.type,
        );
        const optimizedEvent = await processEventData(message.data);
        addEvent(optimizedEvent);
      } else {
        console.warn('[RecordingControl] Unhandled message format:', message);
      }
    };

    // Listen to messages via port
    port.onMessage.addListener(handleMessage);
    console.log('[RecordingControl] Message listener attached to port');

    return () => {
      console.log(
        '[RecordingControl] Cleaning up message listener and disconnecting port',
      );
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
