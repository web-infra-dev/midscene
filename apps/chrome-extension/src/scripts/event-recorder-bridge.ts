/// <reference types="chrome" />

import {
  type ChromeRecordedEvent,
  type RecordedEvent,
  convertToChromeEvents,
} from '@midscene/recorder';

// Event Recorder Bridge
// This script bridges the EventRecorder (injected via record-iife.js) with the Chrome Extension

// Define the EventRecorder interface based on the usage in the code
interface EventRecorder {
  start(): void;
  stop(): void;
  isActive(): boolean;
  optimizeEvent(
    event: ChromeRecordedEvent,
    events: ChromeRecordedEvent[],
  ): ChromeRecordedEvent[];
}

// Extend the global window interface to include EventRecorder
declare global {
  interface Window {
    EventRecorder?: new (
      callback: (event: ChromeRecordedEvent) => Promise<void>,
      sessionId: string,
    ) => EventRecorder;
    recorder: EventRecorder | null;
  }
}

// Define message types for Chrome extension communication
interface ChromeMessage {
  action:
    | 'captureScreenshot'
    | 'events'
    | 'ping'
    | 'start'
    | 'stop'
    | 'getEvents'
    | 'clearEvents';
  data?: ChromeRecordedEvent[];
  sessionId?: string;
}

interface ChromeResponse {
  success: boolean;
  error?: string;
  events?: ChromeRecordedEvent[];
  eventsCount?: number;
}

// Check if EventRecorder is available (should be injected by record-iife.js)
if (typeof window.EventRecorder === 'undefined') {
  console.error(
    '[EventRecorder Bridge] EventRecorder class not found. Make sure record-iife.js is injected first.',
  );
}

if (window?.recorder?.isActive()) {
  window.recorder.stop();
}

window.recorder = null;
let events: ChromeRecordedEvent[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
let pendingEvents: ChromeRecordedEvent[] | null = null;
let isPageUnloading = false;
const eventSendStats = { sent: 0, failed: 0, pending: 0 };

// Helper function to capture screenshot with timeout
async function captureScreenshot(timeout = 1000): Promise<string | undefined> {
  // Skip screenshot if page is unloading
  if (isPageUnloading) {
    console.debug(
      '[EventRecorder Bridge] Skipping screenshot during page unload',
    );
    return undefined;
  }

  try {
    const screenshotPromise = chrome.runtime.sendMessage({
      action: 'captureScreenshot',
    } as ChromeMessage);

    // Add timeout to prevent hanging during navigation
    const timeoutPromise = new Promise<undefined>((_, reject) => {
      setTimeout(() => reject(new Error('Screenshot timeout')), timeout);
    });

    const screenshot = await Promise.race([screenshotPromise, timeoutPromise]);
    if (!screenshot) {
      console.warn(
        '[EventRecorder Bridge] Screenshot capture returned empty result',
      );
    }
    return screenshot;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Screenshot timeout') {
        console.debug('[EventRecorder Bridge] Screenshot capture timed out');
      } else {
        console.error(
          '[EventRecorder Bridge] Failed to capture screenshot:',
          error.message,
        );
        if (error.message.includes('Extension context invalidated')) {
          window?.recorder?.stop();
        }
      }
    }
    return undefined;
  }
}

let initialScreenshot: Promise<string | undefined> | undefined = undefined;
let lastActivityTime = Date.now();
let lastScreenshot: string | undefined = undefined;
let pageChangeDetectionInterval: NodeJS.Timeout | null = null;
const PAGE_CHANGE_CHECK_INTERVAL = 2000; // Check every 2 seconds
const MAX_IDLE_TIME = 100; // 5 seconds of inactivity before updating screenshot

// Function to update screenshot when page changes during idle time
async function updateIdleScreenshot(): Promise<void> {
  if (isPageUnloading || !window.recorder?.isActive()) {
    return;
  }

  const now = Date.now();
  const timeSinceLastActivity = now - lastActivityTime;

  // If enough time has passed since last activity, capture a fresh screenshot
  if (timeSinceLastActivity >= MAX_IDLE_TIME) {
    try {
      const newScreenshot = await captureScreenshot();
      if (newScreenshot) {
        // Only update if we got a valid screenshot and it's different from the last one
        if (!lastScreenshot || newScreenshot !== lastScreenshot) {
          lastScreenshot = newScreenshot;
        }
      }
    } catch (error) {
      console.debug(
        '[EventRecorder Bridge] Failed to update idle screenshot:',
        error,
      );
    }
  }
}

// Function to start page change monitoring
function startPageChangeMonitoring(): void {
  if (pageChangeDetectionInterval) {
    clearInterval(pageChangeDetectionInterval);
  }

  // pageChangeDetectionInterval = setInterval(
  //   updateIdleScreenshot,
  //   PAGE_CHANGE_CHECK_INTERVAL,
  // );
}

// Function to stop page change monitoring
function stopPageChangeMonitoring(): void {
  if (pageChangeDetectionInterval) {
    clearInterval(pageChangeDetectionInterval);
    pageChangeDetectionInterval = null;
  }
}

// Initialize recorder with callback to send events to extension
async function initializeRecorder(sessionId: string): Promise<void> {
  if (!window.EventRecorder) {
    console.error(
      '[EventRecorder Bridge] EventRecorder class not available during initialization',
    );
    return;
  }

  window.recorder = new window.EventRecorder(
    async (event: ChromeRecordedEvent) => {
      // Update last activity time when new event occurs
      lastActivityTime = Date.now();

      const optimizedEvent = window.recorder!.optimizeEvent(event, events);

      // Add event to local array
      events = optimizedEvent;

      console.log('[EventRecorder Bridge] Event processed:', {
        type: event.type,
        event,
        optimizedEvent: optimizedEvent,
      });

      // Add screenshots to the latest event
      // Send updated events array to extension
      sendEventsToExtension(optimizedEvent);
    },
    sessionId,
  );
}

async function sendEventsToExtension(
  optimizedEvent: ChromeRecordedEvent[],
  immediate = false,
): Promise<void> {
  // Store the latest events
  pendingEvents = optimizedEvent;
  eventSendStats.pending = optimizedEvent.length;

  // Clear any existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const sendEventsToExtension = async () => {
    const latestEvent = optimizedEvent[optimizedEvent.length - 1];
    const previousEvent = optimizedEvent[optimizedEvent.length - 2];

    if (immediate || isPageUnloading) {
      // For immediate sends or page unloading, use existing screenshots with fallback logic
      if (optimizedEvent.length > 1) {
        let screenshotBefore = previousEvent.screenshotAfter;

        // If previousEvent screenshot is not available, try to use lastScreenshot as fallback
        if (!screenshotBefore && lastScreenshot) {
          screenshotBefore = lastScreenshot;
          console.log(
            '[EventRecorder Bridge] Using lastScreenshot as fallback for immediate beforeScreen',
          );
        }

        latestEvent.screenshotBefore = screenshotBefore || '';

        if (!screenshotBefore) {
          console.warn(
            '[EventRecorder Bridge] No valid screenshot available for immediate beforeScreen',
          );
        }
      } else {
        // For first event, try to use initialScreenshot or lastScreenshot
        latestEvent.screenshotBefore =
          (await initialScreenshot) || lastScreenshot || '';
      }

      // For screenshotAfter, try to use lastScreenshot or keep existing
      if (!latestEvent.screenshotAfter && lastScreenshot) {
        latestEvent.screenshotAfter = lastScreenshot;
        console.log(
          '[EventRecorder Bridge] Using lastScreenshot for immediate screenshotAfter',
        );
      }
    } else {
      const screenshotAfter = await captureScreenshot();
      let screenshotBefore: string | undefined;

      if (optimizedEvent.length > 1) {
        const timeSinceLastEvent =
          latestEvent.timestamp - previousEvent.timestamp;

        // If too much time has passed since the last event, try to use the updated idle screenshot
        // but fall back to previousEvent.screenshotAfter if lastScreenshot is not available
        if (timeSinceLastEvent > MAX_IDLE_TIME && lastScreenshot) {
          screenshotBefore = lastScreenshot;
          console.log(
            '[EventRecorder Bridge] Using updated idle screenshot for beforeScreen due to long interval',
          );
        } else {
          screenshotBefore = previousEvent.screenshotAfter;
        }

        // Ensure we always have a valid screenshotBefore - fallback to previousEvent.screenshotAfter
        if (!screenshotBefore) {
          screenshotBefore = previousEvent.screenshotAfter;
          console.log(
            '[EventRecorder Bridge] Fallback to previous event screenshot for beforeScreen',
          );
        }
      } else {
        screenshotBefore = await initialScreenshot;
      }

      // Update lastScreenshot with the current screenshot
      if (screenshotAfter) {
        lastScreenshot = screenshotAfter;
      }

      // Ensure we have valid screenshots before assigning
      latestEvent.screenshotAfter = screenshotAfter || lastScreenshot || '';
      latestEvent.screenshotBefore = screenshotBefore || '';

      // Log warning if screenshots are missing
      if (!latestEvent.screenshotAfter) {
        console.warn(
          '[EventRecorder Bridge] Missing screenshotAfter for event:',
          latestEvent.type,
        );
      }
      if (!latestEvent.screenshotBefore) {
        console.warn(
          '[EventRecorder Bridge] Missing screenshotBefore for event:',
          latestEvent.type,
        );
      }
    }

    if (!pendingEvents) return;

    console.log('[EventRecorder Bridge] Sending events to extension:', {
      optimizedEvent: pendingEvents,
      eventsCount: pendingEvents.length,
      eventTypes: pendingEvents.map((e) => e.type),
      immediate,
      isPageUnloading,
    });

    await sendEvents(pendingEvents);

    // Clear the pending events after sending
    pendingEvents = null;
    eventSendStats.pending = 0;
  };

  // Set new timer - bypass debounce if page is unloading
  if (immediate || isPageUnloading) {
    await sendEventsToExtension();
  } else {
    debounceTimer = setTimeout(sendEventsToExtension, 200);
  }
}

// Send events to extension
async function sendEvents(events: ChromeRecordedEvent[]): Promise<void> {
  const message = {
    action: 'events',
    data: convertToChromeEvents(events),
  } as ChromeMessage;

  try {
    await chrome.runtime.sendMessage(message);
    eventSendStats.sent += events.length;
    console.log(
      `[EventRecorder Bridge] Successfully sent ${events.length} events`,
    );
  } catch (error) {
    const errorMsg = (error as Error).message;
    eventSendStats.failed += events.length;
    console.warn('[EventRecorder Bridge] Failed to send events:', errorMsg);
  }
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: ChromeResponse) => void,
  ): boolean => {
    if (message.action === 'ping') {
      sendResponse({
        success: true,
      });
      return true;
    }

    if (message.action === 'start') {
      // Check if recorder is already active to avoid clearing events during recording
      if (window.recorder?.isActive()) {
        sendResponse({
          success: true,
        });
        return true;
      }

      initialScreenshot = captureScreenshot();
      if (!window.recorder) {
        initializeRecorder(message.sessionId!);
      }

      if (window.recorder) {
        window.recorder.start();
        events = []; // Clear previous events
        lastActivityTime = Date.now(); // Reset activity time

        // Initialize lastScreenshot with the initial screenshot
        initialScreenshot
          .then((screenshot) => {
            if (screenshot) {
              lastScreenshot = screenshot;
              console.log(
                '[EventRecorder Bridge] Initialized lastScreenshot with initial screenshot',
              );
            }
          })
          .catch((error) => {
            console.debug(
              '[EventRecorder Bridge] Failed to initialize lastScreenshot:',
              error,
            );
          });

        startPageChangeMonitoring(); // Start monitoring page changes
        console.log(
          '[EventRecorder Bridge] Recording started successfully with session ID:',
          message.sessionId,
        );
        sendResponse({
          success: true,
        });
      } else {
        console.error(
          '[EventRecorder Bridge] Failed to start recording - recorder not initialized with session ID:',
          message.sessionId,
        );
        sendResponse({
          success: false,
          error: 'Failed to initialize recorder',
        });
      }
    } else if (message.action === 'stop') {
      stopPageChangeMonitoring(); // Stop monitoring when recording stops
      // biome-ignore lint/complexity/useOptionalChain: Preserving original logic
      if (window.recorder && window.recorder.isActive()) {
        window.recorder.stop();
        const finalEventsCount = events.length;
        window.recorder = null;
        console.log(
          '[EventRecorder Bridge] Recording stopped successfully with session ID:',
          message.sessionId,
          'with',
          finalEventsCount,
          'events',
        );
        sendResponse({
          success: true,
          eventsCount: finalEventsCount,
        });
      } else {
        console.log(
          '[EventRecorder Bridge] Stop requested but recorder not active with session ID:',
          message.sessionId,
        );
        sendResponse({
          success: false,
          error: 'Recorder not active',
        });
      }
    } else if (message.action === 'getEvents') {
      console.log(
        '[EventRecorder Bridge] Events requested, returning',
        events.length,
        'events',
      );
      sendResponse({
        events: events,
        success: true,
      });
    } else if (message.action === 'clearEvents') {
      const clearedCount = events.length;
      events = [];
      console.log('[EventRecorder Bridge] Cleared', clearedCount, 'events');
      sendResponse({
        success: true,
      });
    }

    return true; // Keep message channel open for async response
  },
);

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[EventRecorder Bridge] Bridge script loaded and ready');
});

// Enhanced page unload handling with synchronous event flushing
window.addEventListener('beforeunload', async () => {
  isPageUnloading = true;
  stopPageChangeMonitoring(); // Stop monitoring during unload
  console.log(
    '[EventRecorder Bridge] Page unloading, flushing events immediately',
    { eventsCount: events.length, stats: eventSendStats },
  );

  // Stop active recorder immediately
  if (window.recorder?.isActive()) {
    window.recorder.stop();
  }

  // Flush any pending events immediately without waiting
  if (events.length > 0 || pendingEvents) {
    const eventsToSend = pendingEvents || events;
    // Use synchronous approach for beforeunload
    try {
      await sendEventsToExtension(eventsToSend, true);
    } catch (error) {
      console.error('[EventRecorder Bridge] Final event send failed:', error);
    }
  }
});

// Listen for navigation events with enhanced logging
window.addEventListener('pagehide', async () => {
  if (!isPageUnloading) {
    isPageUnloading = true;
    console.log('[EventRecorder Bridge] Page hiding, flushing events');
    if (events.length > 0) {
      await sendEventsToExtension(events, true);
    }
  }
  if (pageChangeDetectionInterval) {
    clearInterval(pageChangeDetectionInterval);
  }
});

// Handle visibility changes (tab switches, minimizing) with debounce
let visibilityTimer: NodeJS.Timeout | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !isPageUnloading) {
    // Clear existing timer
    if (visibilityTimer) {
      clearTimeout(visibilityTimer);
    }

    // Debounce visibility changes to avoid excessive sends
    visibilityTimer = setTimeout(() => {
      console.log('[EventRecorder Bridge] Page became hidden, flushing events');
      if (events.length > 0) {
        sendEventsToExtension(events, true);
      }
    }, 100);
  } else if (document.visibilityState === 'visible') {
    // Cancel flush if page becomes visible again
    if (visibilityTimer) {
      clearTimeout(visibilityTimer);
      visibilityTimer = null;
    }
  }

  if (pageChangeDetectionInterval) {
    clearInterval(pageChangeDetectionInterval);
  }
});

// Add navigation detection
let lastUrl = window.location.href;
const checkForNavigation = () => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('[EventRecorder Bridge] Navigation detected:', {
      from: lastUrl,
      to: currentUrl,
    });
    lastUrl = currentUrl;

    // Flush events on navigation
    if (events.length > 0 && !isPageUnloading) {
      sendEventsToExtension(events, true);
    }
  }

  if (pageChangeDetectionInterval) {
    clearInterval(pageChangeDetectionInterval);
  }
};

// Wrap native history API to catch SPA navigation immediately
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  const result = originalPushState.apply(this, args);
  checkForNavigation(); // Immediately check for URL change
  return result;
};

history.replaceState = function (...args) {
  const result = originalReplaceState.apply(this, args);
  checkForNavigation(); // Immediately check for URL change
  return result;
};

// Monitor navigation using multiple methods
window.addEventListener('popstate', checkForNavigation); // Browser back/forward
window.addEventListener('hashchange', checkForNavigation); // Hash-based routing (#/path)
