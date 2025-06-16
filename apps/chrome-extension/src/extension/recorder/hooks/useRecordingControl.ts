import type { ChromeRecordedEvent } from '@midscene/recorder';
import { message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type RecordingSession, useRecordStore } from '../../../store';
import {
  clearDescriptionCache,
  optimizeEvent,
} from '../../../utils/eventOptimizer';
import { dbManager } from '../../../utils/indexedDB';
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
  checkRecordingRecovery?: (tab: chrome.tabs.Tab) => Promise<{
    canRecover: boolean;
    sessionId?: string;
    lastUrl?: string;
    timeSinceNavigation?: number;
  }>,
  selectSession?: (session: RecordingSession) => void,
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

  // Recovery state management
  const [isRecoveryInProgress, setIsRecoveryInProgress] = useState(false);
  const recoveryAttemptedRef = useRef<Set<string>>(new Set());

  // Check for recording recovery on component mount and tab changes
  useEffect(() => {
    const checkRecovery = async () => {
      // Skip if no tab, no recovery function, already recording, or recovery in progress
      if (
        !currentTab ||
        !checkRecordingRecovery ||
        isRecording ||
        isRecoveryInProgress
      ) {
        return;
      }

      try {
        const recovery = await checkRecordingRecovery(currentTab);
        if (recovery.canRecover && recovery.sessionId) {
          // Check if we've already attempted recovery for this session/URL combination
          const sessionUrlKey = `${recovery.sessionId}-${currentTab.url}`;
          if (recoveryAttemptedRef.current.has(sessionUrlKey)) {
            recordLogger.info(
              'Recovery already attempted for this session/URL',
              {
                sessionId: recovery.sessionId,
                url: currentTab.url,
              },
            );
            return;
          }

          // Mark recovery as attempted for this session/URL
          recoveryAttemptedRef.current.add(sessionUrlKey);
          setIsRecoveryInProgress(true);

          recordLogger.info(
            'Auto-continuing recording from previous session',
            recovery,
          );

          // Automatically continue recording without showing modal
          const session = await dbManager.getSession(recovery.sessionId);
          if (session) {
            recordLogger.info('Auto-loaded session for recovery', {
              sessionId: session.id,
              existingEventsCount: session.events.length,
            });

            // Set this as the current session
            if (selectSession) {
              selectSession(session);
              recordLogger.info('Set session as current for auto-recovery', {
                sessionId: session.id,
              });
            }

            // Update session status
            await updateSession(session.id, {
              status: 'idle',
              updatedAt: Date.now(),
            });

            // Set the events from the previous session
            setEvents(session.events);

            // Small delay to ensure state updates
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Auto-start recording with the existing session
            await startRecording(recovery.sessionId);

            // Clear recovery state after successful auto-continue
            await dbManager.clearNavigationRecoveryState();

            message.success(
              `Auto-continued recording from previous session (${session.events.length} events loaded)`,
            );
          } else {
            recordLogger.error('Failed to auto-load session for recovery', {
              sessionId: recovery.sessionId,
            });
            // Clear recovery state if session not found
            await dbManager.clearNavigationRecoveryState();
          }
        }
      } catch (error) {
        recordLogger.error(
          'Failed to auto-continue recording recovery',
          undefined,
          error,
        );
        // Clear recovery state on error
        await dbManager.clearNavigationRecoveryState();
      } finally {
        setIsRecoveryInProgress(false);
      }
    };

    // Only check recovery when tab becomes available and complete
    if (currentTab?.status === 'complete') {
      checkRecovery();
    }
  }, [
    currentTab?.id,
    currentTab?.status,
    currentTab?.url,
    checkRecordingRecovery,
    selectSession,
    updateSession,
    setEvents,
    isRecording,
    isRecoveryInProgress,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear recovery attempts cache on unmount
      recoveryAttemptedRef.current.clear();
    };
  }, []);

  // Real-time event persistence during recording
  const persistEventToSession = useCallback(
    async (event: ChromeRecordedEvent) => {
      if (!currentSessionId || !isRecording) return;

      try {
        const session = getCurrentSession();
        if (session) {
          const updatedEvents = [...session.events, event];
          updateSession(currentSessionId, {
            events: updatedEvents,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        recordLogger.error(
          'Failed to persist event to session',
          undefined,
          error,
        );
      }
    },
    [currentSessionId, isRecording, getCurrentSession, updateSession],
  );

  // Define stopRecording early using useCallback
  const stopRecording = useCallback(async () => {
    recordLogger.info('Stopping recording', {
      sessionId: currentSessionId || undefined,
      tabId: currentTab?.id,
    });

    if (!isExtensionMode) {
      await setIsRecording(false);
      return;
    }

    if (!currentTab?.id) {
      recordLogger.error('No active tab found for stopping recording');
      message.error('No active tab found');
      return;
    }

    // Set isRecording to false immediately to prevent UI from showing recording state
    await setIsRecording(false);

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
            recordLogger.info('Generating AI title', {
              eventsCount: events.length,
            });
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
              recordLogger.error(
                'Failed to generate title/description',
                undefined,
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
        }
      }
    } catch (error) {
      recordLogger.error('Failed to stop recording', undefined, error);
      message.error(`Failed to stop recording: ${error}`);
      // Still stop recording on our side even if there was an error
      await setIsRecording(false);
    }
  }, [
    isExtensionMode,
    currentTab,
    setIsRecording,
    currentSessionId,
    getCurrentSession,
    events,
    updateSession,
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
  const startRecording = useCallback(
    async (sessionId?: string) => {
      recordLogger.info('Starting recording', {
        tabId: currentTab?.id,
        sessionId,
      });

      if (!isExtensionMode) {
        recordLogger.error('Not in extension environment');
        message.error(
          'Recording is only available in Chrome extension environment',
        );
        return;
      }

      // Check if there's a current session or use provided sessionId
      let sessionToUse: RecordingSession | null = null;

      if (sessionId) {
        // Use the specific session ID provided (for recovery)
        const specificSession = await dbManager.getSession(sessionId);
        if (specificSession) {
          sessionToUse = specificSession;
          recordLogger.info('Using specified session', {
            sessionId,
            eventsCount: specificSession.events.length,
          });
        } else {
          recordLogger.error('Specified session not found', { sessionId });
          message.error('Specified session not found');
          return;
        }
      } else {
        // Use current session if no specific sessionId provided
        sessionToUse = getCurrentSession();
      }

      if (!sessionToUse) {
        // Auto-create session with timestamp name
        const sessionName = generateSessionName();
        recordLogger.info('Auto-creating session', { action: 'create' });

        sessionToUse = createNewSession(sessionName);
        message.success(`Session "${sessionName}" created automatically`);

        // Small delay to ensure state updates before continuing
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        recordLogger.info('Using existing session', {
          sessionId: sessionToUse.id,
          existingEventsCount: sessionToUse.events.length,
        });
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
        await setIsRecording(true);

        // Only clear events if this is a new session or if the session has no existing events
        // This allows resuming recording on existing sessions without losing previous events
        if (sessionToUse.events.length === 0) {
          clearEvents(); // Clear previous events for new recording
        } else {
          // Load existing events for continuation
          setEvents(sessionToUse.events);
          recordLogger.info('Loaded existing events for continuation', {
            eventsCount: sessionToUse.events.length,
          });
        }

        recordLogger.success('Recording started', {
          sessionId: sessionToUse.id,
        });
        message.success('Recording started');
      } catch (error) {
        recordLogger.error('Failed to start recording', undefined, error);
        message.error(
          'Failed to start recording. Please ensure you are on a regular web page (not Chrome internal pages) and try again.',
        );
      }
    },
    [
      isExtensionMode,
      getCurrentSession,
      createNewSession,
      updateSession,
      currentTab,
      setIsRecording,
      clearEvents,
    ],
  );

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
          recordLogger.error(
            'Port disconnect error',
            undefined,
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
      // Validate session ID - only process events from current recording session
      if (
        message.sessionId &&
        currentSessionId &&
        message.sessionId !== currentSessionId
      ) {
        return;
      }

      if (message.action === 'events' && Array.isArray(message.data)) {
        recordLogger.info('Processing bulk events', {
          eventsCount: message.data.length,
        });
        const eventsData = await Promise.all(
          message.data.map(processEventData),
        );
        setEvents(eventsData);

        // Persist events to session during recording
        if (currentSessionId && isRecording) {
          updateSession(currentSessionId, {
            events: eventsData,
            updatedAt: Date.now(),
          });
        }
      } else if (
        message.action === 'event' &&
        message.data &&
        !Array.isArray(message.data)
      ) {
        const optimizedEvent = await processEventData(message.data);
        addEvent(optimizedEvent);

        // Real-time persistence during recording
        await persistEventToSession(optimizedEvent);

        // Legacy persistence for compatibility (will be removed once new system is stable)
        if (currentSessionId && isRecording) {
          const currentSession = getCurrentSession();
          if (currentSession) {
            const updatedEvents = [...currentSession.events, optimizedEvent];
            updateSession(currentSessionId, {
              events: updatedEvents,
              updatedAt: Date.now(),
            });
          }
        }
      } else {
        recordLogger.warn('Unhandled message format', {
          action: message.action,
        });
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
