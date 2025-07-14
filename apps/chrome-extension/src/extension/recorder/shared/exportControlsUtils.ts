import type { ChromeRecordedEvent } from '@midscene/recorder';
import { message } from 'antd';
import { useRecordStore, useRecordingSessionStore } from '../../../store';
import { recordLogger } from '../logger';

/**
 * Utility functions for export controls to eliminate code duplication
 */

/**
 * Get the most current events with AI descriptions
 */
export const getLatestEvents = (sessionId?: string): ChromeRecordedEvent[] => {
  const currentLiveEvents = useRecordStore.getState().events;
  const { isRecording } = useRecordStore.getState();

  // If currently recording, always use live events as they have the most up-to-date AI descriptions
  if (isRecording && currentLiveEvents.length > 0) {
    // recordLogger.info('Using live events during recording', {
    //   events: currentLiveEvents
    // });
    return currentLiveEvents;
  }

  // If not recording, compare live events and session events to find the most complete data
  if (sessionId) {
    const session = useRecordingSessionStore
      .getState()
      .sessions.find((s) => s.id === sessionId);
    const sessionEvents = session?.events || [];

    // If we have live events, prefer them as they are more up-to-date
    if (
      currentLiveEvents.length > 0 &&
      currentLiveEvents.length >= sessionEvents.length
    ) {
      return currentLiveEvents;
    }

    return sessionEvents;
  }

  // Fallback to live events or provided events
  throw new Error('No events found');
};

/**
 * Check if all elements have descriptions generated
 */
export const checkElementDescriptions = (
  events: ChromeRecordedEvent[],
): boolean => {
  const eventsNeedingDescriptions = events.filter(
    (event: ChromeRecordedEvent) =>
      event.type === 'click' ||
      event.type === 'input' ||
      event.type === 'scroll',
  );

  return eventsNeedingDescriptions.every(
    (event: ChromeRecordedEvent) => !event.descriptionLoading,
  );
};

/**
 * Wait for all element descriptions to be generated
 */
export const waitForElementDescriptions = (
  getEvents: () => ChromeRecordedEvent[],
): Promise<void> => {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (checkElementDescriptions(getEvents())) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 200); // Check every 200ms

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 30000);
  });
};

/**
 * Stop recording if currently recording and wait for completion
 */
export const stopRecordingIfActive = async (
  onStopRecording?: () => void | Promise<void>,
): Promise<void> => {
  const { isRecording } = useRecordStore.getState();

  if (isRecording && onStopRecording) {
    recordLogger.info('Stopping recording before export operation');
    message.loading('Stopping recording...', 0);
    await Promise.resolve(onStopRecording());
    message.destroy();
    recordLogger.success('Recording stopped, proceeding with export operation');

    // Small delay to ensure events are fully saved to session
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

/**
 * Get the current session name from store if available, fallback to provided name
 */
export const resolveSessionName = (
  defaultName: string,
  sessionId?: string,
): string => {
  if (sessionId) {
    const session = useRecordingSessionStore
      .getState()
      .sessions.find((s) => s.id === sessionId);
    if (session) {
      return session.name;
    }
  }
  return defaultName;
};
