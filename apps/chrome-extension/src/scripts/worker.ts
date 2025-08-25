/// <reference types="chrome" />

import type { WebUIContext } from '@midscene/web';

const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
};

// save screenshot
interface WorkerRequestSaveContext {
  context: WebUIContext;
}

// get screenshot
interface WorkerRequestGetContext {
  id: string;
}

// console-browserify won't work in worker, so we need to use globalThis.console
const console = globalThis.console;

// Remove openPanelOnActionClick to allow chrome.action.onClicked to work
// chrome.sidePanel
//   .setPanelBehavior({ openPanelOnActionClick: true })
//   .catch((error) => console.error(error));

// Handle extension icon clicks - open side panel and inject scripts
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[ServiceWorker] Extension icon clicked', {
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
  });

  if (!tab.id) {
    console.error('[ServiceWorker] No tab ID available');
    return;
  }

  // 1. Open the side panel for this tab
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    console.log('[ServiceWorker] Side panel opened successfully');
  } catch (error) {
    console.error('[ServiceWorker] Failed to open side panel:', error);
    // Continue with script injection even if side panel fails to open
  }

  // 2. Check if URL is protected
  console.log('[ServiceWorker] Checking URL protection status for:', tab.url);
  if (
    tab.url?.startsWith('chrome://') ||
    tab.url?.startsWith('chrome-extension://') ||
    tab.url?.startsWith('edge://') ||
    tab.url?.startsWith('about:') ||
    tab.url?.startsWith('moz-extension://')
  ) {
    console.log(
      '[ServiceWorker] Cannot inject script on restricted page:',
      tab.url,
    );

    // Notify side panel about restriction
    setTimeout(() => {
      try {
        chrome.runtime.sendMessage({
          action: 'scriptInjectionFailed',
          tabId: tab.id,
          error: `Cannot inject scripts on restricted page: ${tab.url}. Please navigate to a regular website (like google.com) to use recording.`,
        });
      } catch (msgError) {
        console.log(
          '[ServiceWorker] Could not notify side panel about restriction',
        );
      }
    }, 1000);
    return;
  }

  // 3. Use activeTab permission (automatically granted when user clicks extension icon)
  try {
    // activeTab permission is automatically granted when user clicks the extension icon
    // This allows us to inject scripts without requesting broad host permissions

    // Inject the recorder script first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/recorder-iife.js'],
    });

    // Then inject the bridge script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/event-recorder-bridge.js'],
    });

    console.log(
      '[ServiceWorker] Side panel opened and scripts injected successfully via activeTab permission',
    );

    // Give the side panel some time to load before sending the message
    setTimeout(() => {
      try {
        chrome.runtime.sendMessage({
          action: 'scriptsInjected',
          tabId: tab.id,
          success: true,
        });
        console.log(
          '[ServiceWorker] Sent scriptsInjected message to side panel',
        );
      } catch (msgError) {
        console.log(
          '[ServiceWorker] Side panel not ready for messages yet:',
          msgError,
        );
      }
    }, 1000); // Wait 1 second for side panel to load
  } catch (error) {
    console.error('[ServiceWorker] Failed to inject scripts:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      if (error.message.includes('Cannot access contents of url')) {
        errorMessage =
          'Cannot inject script on this page, please click the Midscene extension icon again to authorize';
      } else if (
        error.message.includes('chrome://') ||
        error.message.includes('chrome-extension://')
      ) {
        errorMessage =
          'Cannot record on Chrome internal pages. Please navigate to a regular website.';
      } else {
        errorMessage = error.message;
      }
    }

    // Notify side panel about injection failure
    try {
      chrome.runtime.sendMessage({
        action: 'scriptInjectionFailed',
        tabId: tab.id,
        error: errorMessage,
      });
    } catch (msgError) {
      console.log(
        '[ServiceWorker] Could not notify side panel about injection failure',
      );
    }
  }
});

// cache data between sidepanel and fullscreen playground
const randomUUID = () => {
  return Math.random().toString(36).substring(2, 15);
};
const cacheMap = new Map<string, WebUIContext>();

// Store connected ports for message forwarding
const connectedPorts = new Set<chrome.runtime.Port>();

// Listen for connections from extension pages
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'record-events') {
    connectedPorts.add(port);
    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  } else {
    console.log('[ServiceWorker] Unknown port name:', port.name);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle screenshot capture request
  if (request.action === 'captureScreenshot') {
    if (sender.tab && sender.tab.id !== undefined) {
      chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error(
              '[ServiceWorker] Failed to capture screenshot:',
              chrome.runtime.lastError,
            );
            sendResponse(null);
          } else {
            sendResponse(dataUrl);
          }
        },
      );
      return true; // Keep the message channel open for async response
    } else {
      console.error('[ServiceWorker] No valid tab for screenshot capture');
      sendResponse(null);
      return true;
    }
  }

  // Forward recording events to connected extension pages
  if (request.action === 'events' || request.action === 'event') {
    if (connectedPorts.size === 0) {
      console.warn(
        '[ServiceWorker] No connected ports to forward recording events to',
      );
    }

    connectedPorts.forEach((port) => {
      try {
        port.postMessage(request);
      } catch (error) {
        console.error(
          '[ServiceWorker] Failed to forward message to port:',
          error,
        );
        connectedPorts.delete(port); // Remove invalid port
      }
    });
    sendResponse({ success: true });
    return true;
  }

  switch (request.type) {
    case workerMessageTypes.SAVE_CONTEXT: {
      const payload: WorkerRequestSaveContext = request.payload;
      const { context } = payload;
      const id = randomUUID();
      cacheMap.set(id, context);
      sendResponse({ id });
      break;
    }
    case workerMessageTypes.GET_CONTEXT: {
      const payload: WorkerRequestGetContext = request.payload;
      const { id } = payload;
      const context = cacheMap.get(id) as WebUIContext;
      if (!context) {
        sendResponse({ error: 'Screenshot not found' });
      } else {
        sendResponse({ context });
      }

      break;
    }
    default:
      sendResponse({ error: 'Unknown message type' });
      break;
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});
