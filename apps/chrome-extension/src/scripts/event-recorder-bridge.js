// Event Recorder Bridge
// This script bridges the EventRecorder (injected via record-iife.js) with the Chrome Extension

// Check if EventRecorder is available (should be injected by record-iife.js)
if (typeof window.EventRecorder === 'undefined') {
  console.error(
    'EventRecorder not found. Make sure record-iife.js is injected first.',
  );
}
if (window.recorder && window.recorder.isActive()) {
  recorder.stop();
}

window.recorder = null;
let events = [];

// Helper function to capture screenshot
async function captureScreenshot() {
  try {
    return await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
    });
  } catch (error) {
    // console.error('Failed to capture screenshot:', error);
    return null;
  }
}

// Initialize recorder with callback to send events to extension
async function initializeRecorder() {
  if (!window.EventRecorder) {
    console.error('EventRecorder class not available');
    return;
  }

  window.recorder = new window.EventRecorder(async (event) => {
    // Capture screenshot before processing the event
    const screenshotBefore = await captureScreenshot();

    const optimizedEvent = recorder.optimizeEvent(event, events);
    // Add event to local array
    events = optimizedEvent;

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
  });
}

function sendEventsToExtension(optimizedEvent) {
  // Send events array to extension popup
  console.log('sending events to extension', events);
  chrome.runtime
    .sendMessage({
      action: 'events',
      data: optimizedEvent.map((event) => ({
        type: event.type,
        timestamp: event.timestamp,
        // Element position and click coordinates
        elementRect: event.elementRect ? {
          left: event.elementRect.left,
          top: event.elementRect.top,
          width: event.elementRect.width,
          height: event.elementRect.height,
          x: event.elementRect.x,
          y: event.elementRect.y,
        } : undefined,
        // Page information and screenshots
        pageInfo: event.pageInfo ? {
          width: event.pageInfo.width,
          height: event.pageInfo.height,
        } : undefined,
        screenshotBefore: event.screenshotBefore,
        screenshotAfter: event.screenshotAfter,

        // Other event properties
        value: event.value,
      })),
    })
    .catch((error) => {
      // Silently handle errors (popup might not be open)
      console.debug('Failed to send event to extension:', error);
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
      initializeRecorder();
    }

    if (window.recorder) {
      recorder.start();
      events = []; // Clear previous events
      console.log('Event recording started');
      sendResponse({
        success: true,
      });
    } else {
      console.error('Failed to initialize recorder');
      sendResponse({
        success: false,
        error: 'Failed to initialize recorder',
      });
    }
  } else if (message.action === 'stop') {
    // biome-ignore lint/complexity/useOptionalChain: <explanation>
    if (window.recorder && window.recorder.isActive()) {
      window.recorder.stop();
      window.recorder = null;
      console.log('Event recording stopped');
      sendResponse({
        success: true,
        eventsCount: events.length,
      });
    } else {
      sendResponse({
        success: false,
        error: 'Recorder not active',
      });
    }
  } else if (message.action === 'getEvents') {
    sendResponse({
      events: events,
    });
  } else if (message.action === 'clearEvents') {
    events = [];
    sendResponse({
      success: true,
    });
  }

  return true; // Keep message channel open for async response
});

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('Event recorder bridge loaded');
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  // biome-ignore lint/complexity/useOptionalChain: <explanation>
  if (window.recorder && window.recorder.isActive()) {
    recorder.stop();
  }
});