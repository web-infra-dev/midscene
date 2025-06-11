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

// Helper function to capture screenshot
async function captureScreenshot(): Promise<string | undefined> {
  try {
    const screenshot = await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
    } as ChromeMessage);
    if (!screenshot) {
      console.warn(
        '[EventRecorder Bridge] Screenshot capture returned empty result',
      );
    }
    return screenshot;
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        '[EventRecorder Bridge] Failed to capture screenshot:',
        error.message,
      );
      if (error.message.includes('Extension context invalidated')) {
        window?.recorder?.stop();
      }
    }
    return undefined;
  }
}

let initialScreenshot: Promise<string | undefined> | undefined = undefined;

// Initialize recorder with callback to send events to extension
async function initializeRecorder(sessionId: string): Promise<void> {
  if (!window.EventRecorder) {
    console.error(
      '[EventRecorder Bridge] EventRecorder class not available during initialization',
    );
    return;
  }

  console.log(
    '[EventRecorder Bridge] Initializing EventRecorder with callback',
  );

  window.recorder = new window.EventRecorder(
    async (event: ChromeRecordedEvent) => {
      const optimizedEvent = window.recorder!.optimizeEvent(event, events);

      // Add event to local array
      events = optimizedEvent;

      console.log('[EventRecorder Bridge] Event processed:', {
        type: event.type,
        event,
        optimizedEvent: optimizedEvent,
      });

      // Add screenshots to the latest event
      setTimeout(async () => {
        const latestEvent = optimizedEvent[optimizedEvent.length - 1];
        const previousEvent = optimizedEvent[optimizedEvent.length - 2];
        const screenshotAfter = await captureScreenshot();
        let screenshotBefore: string | undefined;

        if (optimizedEvent.length > 1) {
          screenshotBefore = previousEvent.screenshotAfter;
        } else {
          screenshotBefore = await initialScreenshot;
        }

        // Capture screenshot before processing the event
        latestEvent.screenshotAfter = screenshotAfter!;
        latestEvent.screenshotBefore = screenshotBefore!;

        // Send updated events array to extension
        sendEventsToExtension(optimizedEvent);
      }, 100);
    },
    sessionId,
  );
}

function sendEventsToExtension(optimizedEvent: ChromeRecordedEvent[]): void {
  // Store the latest events
  pendingEvents = optimizedEvent;

  // Clear any existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer
  debounceTimer = setTimeout(() => {
    if (!pendingEvents) return;

    console.log('[EventRecorder Bridge] Sending events to extension:', {
      optimizedEvent: pendingEvents,
      eventsCount: pendingEvents.length,
      eventTypes: pendingEvents.map((e) => e.type),
    });

    chrome.runtime
      .sendMessage({
        action: 'events',
        data: convertToChromeEvents(pendingEvents),
      } as ChromeMessage)
      .catch((error) => {
        // Extension popup might not be open
        console.debug(
          '[EventRecorder Bridge] Failed to send events to extension (popup may be closed):',
          (error as Error).message,
        );
      });

    // Clear the pending events after sending
    pendingEvents = null;
  }, 300);
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
      initialScreenshot = captureScreenshot();
      if (!window.recorder) {
        initializeRecorder(message.sessionId!);
      }

      if (window.recorder) {
        window.recorder.start();
        events = []; // Clear previous events
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

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.recorder?.isActive()) {
    console.log(
      '[EventRecorder Bridge] Page unloading, stopping active recorder',
    );
    window.recorder.stop();
  }
});
