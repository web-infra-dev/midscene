/// <reference types="chrome" />

import { uuid } from '@midscene/shared/utils';
import type { WebUIContext } from '@midscene/web';
import { BridgeConnector, type BridgeStatus } from '../utils/bridgeConnector';

const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
  // Background bridge control messages
  BRIDGE_START: 'bridge-start',
  BRIDGE_STOP: 'bridge-stop',
  BRIDGE_GET_STATUS: 'bridge-get-status',
  BRIDGE_SET_AUTO_CONNECT: 'bridge-set-auto-connect',
  BRIDGE_GET_AUTO_CONNECT: 'bridge-get-auto-connect',
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

// Background Bridge for MCP connection
const BRIDGE_STORAGE_KEY = 'midscene_bridge_auto_connect';
let backgroundBridge: BridgeConnector | null = null;
let currentBridgeStatus: BridgeStatus = 'closed';

function createBackgroundBridge(serverEndpoint?: string): BridgeConnector {
  return new BridgeConnector(
    (message, type) => {
      console.log(`[BackgroundBridge] ${type}: ${message}`);
    },
    (status) => {
      currentBridgeStatus = status;
      console.log(`[BackgroundBridge] Status changed: ${status}`);
    },
    serverEndpoint,
  );
}

async function startBackgroundBridge(serverEndpoint?: string): Promise<void> {
  if (backgroundBridge) {
    await backgroundBridge.disconnect();
  }
  backgroundBridge = createBackgroundBridge(serverEndpoint);
  await backgroundBridge.connect();
  console.log('[BackgroundBridge] Started');
}

async function stopBackgroundBridge(): Promise<void> {
  if (backgroundBridge) {
    await backgroundBridge.disconnect();
    backgroundBridge = null;
    currentBridgeStatus = 'closed';
    console.log('[BackgroundBridge] Stopped');
  }
}

async function initBackgroundBridgeIfEnabled(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(BRIDGE_STORAGE_KEY);
    const autoConnect = result[BRIDGE_STORAGE_KEY];
    if (autoConnect?.enabled) {
      console.log('[BackgroundBridge] Auto-connect enabled, starting...');
      await startBackgroundBridge(autoConnect.serverEndpoint);
    }
  } catch (error) {
    console.error('[BackgroundBridge] Failed to init:', error);
  }
}

// Initialize background bridge on startup
initBackgroundBridgeIfEnabled();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// cache data between sidepanel and fullscreen playground
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
      const id = uuid();
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
    case workerMessageTypes.BRIDGE_START: {
      const { serverEndpoint } = request.payload || {};
      startBackgroundBridge(serverEndpoint)
        .then(() =>
          sendResponse({ success: true, status: currentBridgeStatus }),
        )
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    case workerMessageTypes.BRIDGE_STOP: {
      stopBackgroundBridge()
        .then(() =>
          sendResponse({ success: true, status: currentBridgeStatus }),
        )
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    case workerMessageTypes.BRIDGE_GET_STATUS: {
      sendResponse({ status: currentBridgeStatus });
      break;
    }
    case workerMessageTypes.BRIDGE_SET_AUTO_CONNECT: {
      const { enabled, serverEndpoint } = request.payload || {};
      chrome.storage.local
        .set({ [BRIDGE_STORAGE_KEY]: { enabled, serverEndpoint } })
        .then(() => {
          if (enabled) {
            return startBackgroundBridge(serverEndpoint);
          }
          return stopBackgroundBridge();
        })
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    case workerMessageTypes.BRIDGE_GET_AUTO_CONNECT: {
      chrome.storage.local
        .get(BRIDGE_STORAGE_KEY)
        .then((result) => {
          const config = result[BRIDGE_STORAGE_KEY] || { enabled: false };
          sendResponse({ ...config, status: currentBridgeStatus });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    default:
      sendResponse({ error: 'Unknown message type' });
      break;
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Re-initialize background bridge on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[ServiceWorker] Browser startup - checking background bridge');
  initBackgroundBridgeIfEnabled();
});

// Reload all tabs after extension is installed or updated (development only)
// This ensures content scripts are properly injected during development
chrome.runtime.onInstalled.addListener(async (details) => {
  // Re-initialize background bridge after extension update
  if (details.reason === 'install' || details.reason === 'update') {
    console.log(
      '[ServiceWorker] Extension installed/updated - checking background bridge',
    );
    initBackgroundBridgeIfEnabled();
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  if (
    isDevelopment &&
    (details.reason === 'install' || details.reason === 'update')
  ) {
    try {
      const tabs = await chrome.tabs.query({});
      const restrictedProtocols = [
        'chrome:',
        'chrome-extension:',
        'about:',
        'edge:',
        'devtools:',
      ];

      for (const tab of tabs) {
        if (
          tab.id &&
          tab.url &&
          !restrictedProtocols.some((protocol) => tab.url?.startsWith(protocol))
        ) {
          try {
            await chrome.tabs.reload(tab.id);
            console.log('[ServiceWorker] Reloaded tab:', tab.id);
          } catch (error) {
            console.error(
              '[ServiceWorker] Failed to reload tab:',
              tab.id,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        '[ServiceWorker] Error reloading tabs after extension update:',
        error,
      );
    }
  }
});
