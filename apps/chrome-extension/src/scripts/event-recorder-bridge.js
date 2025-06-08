// Event Recorder Bridge
// This script bridges the EventRecorder (injected via record-iife.js) with the Chrome Extension

// Check if EventRecorder is available (should be injected by record-iife.js)
if (typeof window.EventRecorder === 'undefined') {
  console.error(
    '[EventRecorder Bridge] EventRecorder class not found. Make sure record-iife.js is injected first.',
  );
}
if (window.recorder && window.recorder.isActive()) {
  window.recorder.stop();
}

window.recorder = null;
let events = [];

// Helper function to capture screenshot
async function captureScreenshot() {
  try {
    const screenshot = await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
    });
    if (!screenshot) {
      console.warn(
        '[EventRecorder Bridge] Screenshot capture returned empty result',
      );
    }
    return screenshot;
  } catch (error) {
    console.error(
      '[EventRecorder Bridge] Failed to capture screenshot:',
      error.message,
    );
    return null;
  }
}

// Initialize recorder with callback to send events to extension
async function initializeRecorder(sessionId) {
  if (!window.EventRecorder) {
    console.error(
      '[EventRecorder Bridge] EventRecorder class not available during initialization',
    );
    return;
  }

  console.log(
    '[EventRecorder Bridge] Initializing EventRecorder with callback',
  );
  window.recorder = new window.EventRecorder(async (event) => {
    // Capture screenshot before processing the event
    const screenshotBefore = await captureScreenshot();

    const optimizedEvent = window.recorder.optimizeEvent(event, events);
    // Add event to local array
    events = optimizedEvent;

    console.log('[EventRecorder Bridge] Event processed:', {
      type: event.type,
      eventsCount: optimizedEvent.length,
      hasScreenshot: !!screenshotBefore,
    });

    // Add screenshots to the latest event
    if (optimizedEvent.length > 0) {
      const latestEvent = optimizedEvent[optimizedEvent.length - 1];
      if (screenshotBefore) {
        latestEvent.screenshotBefore = screenshotBefore;
      }

      // Capture screenshot after the event (with a small delay to let the UI update)
      setTimeout(async () => {
        const screenshotAfter = await captureScreenshot();
        if (screenshotAfter) {
          latestEvent.screenshotAfter = screenshotAfter;
        }

        // Send updated events array to extension popup
        sendEventsToExtension(optimizedEvent);
      }, 100);
    } else {
      // Send events array to extension popup
      sendEventsToExtension(optimizedEvent);
    }
  }, sessionId);
}

function sendEventsToExtension(optimizedEvent) {
  console.log('[EventRecorder Bridge] Sending events to extension:', {
    optimizedEvent,
    eventsCount: optimizedEvent.length,
    eventTypes: optimizedEvent.map((e) => e.type),
  });

  chrome.runtime
    .sendMessage({
      action: 'events',
      data: optimizedEvent.map((event) => ({
        hashId: event.hashId,
        type: event.type,
        timestamp: event.timestamp,
        // Element position and click coordinates
        elementRect: event.elementRect,
        // Page information and screenshots
        pageInfo: event.pageInfo,
        screenshotBefore: event.screenshotBefore,
        screenshotAfter: event.screenshotAfter,

        // Other event properties
        value: event.value,
      })),
    })
    .catch((error) => {
      // Extension popup might not be open
      console.debug(
        '[EventRecorder Bridge] Failed to send events to extension (popup may be closed):',
        error.message,
      );
    });
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({
      success: true,
    });
    return true;
  }

  if (message.action === 'start') {
    if (!window.recorder) {
      initializeRecorder(message.sessionId);
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
    // biome-ignore lint/complexity/useOptionalChain: <explanation>
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
});

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[EventRecorder Bridge] Bridge script loaded and ready');
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.recorder && window.recorder.isActive()) {
    console.log(
      '[EventRecorder Bridge] Page unloading, stopping active recorder',
    );
    window.recorder.stop();
  }
});