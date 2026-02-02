/// <reference types="chrome" />

import { uuid } from '@midscene/shared/utils';
import type { WebUIContext } from '@midscene/web';
import { BridgeConnector, type BridgeStatus } from '../utils/bridgeConnector';
import { workerMessageTypes } from '../utils/workerMessageTypes';

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

// Store connected ports for bridge status updates
const bridgePorts = new Set<chrome.runtime.Port>();

// Broadcast bridge status to all connected UI pages
function broadcastBridgeStatus(status: BridgeStatus) {
  bridgePorts.forEach((port) => {
    try {
      port.postMessage({
        type: workerMessageTypes.BRIDGE_STATUS_CHANGED,
        status,
      });
    } catch (error) {
      console.error('[BackgroundBridge] Failed to broadcast status:', error);
      bridgePorts.delete(port);
    }
  });
}

// Broadcast bridge message to all connected UI pages
function broadcastBridgeMessage(message: string, msgType: 'log' | 'status') {
  bridgePorts.forEach((port) => {
    try {
      port.postMessage({
        type: workerMessageTypes.BRIDGE_MESSAGE,
        message,
        msgType,
      });
    } catch (error) {
      console.error('[BackgroundBridge] Failed to broadcast message:', error);
      bridgePorts.delete(port);
    }
  });
}

function createBackgroundBridge(serverEndpoint?: string): BridgeConnector {
  return new BridgeConnector(
    (message, type) => {
      console.log(`[BackgroundBridge] ${type}: ${message}`);
      broadcastBridgeMessage(message, type);
    },
    (status) => {
      currentBridgeStatus = status;
      console.log(`[BackgroundBridge] Status changed: ${status}`);
      broadcastBridgeStatus(status);
      // Update keepalive based on bridge status
      const shouldEnable = status === 'connected' || status === 'listening';
      void setupKeepalive(shouldEnable).catch((error) => {
        console.error(
          '[Keepalive] Failed to update after status change:',
          error,
        );
      });
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
    // Update keepalive - check if auto-connect is still enabled
    void setupKeepalive().catch((error) => {
      console.error('[Keepalive] Failed to update after bridge stop:', error);
    });
  }
}

async function initBackgroundBridgeIfEnabled(): Promise<void> {
  // Wait for chrome.storage to be available
  if (!chrome?.storage?.local) {
    console.log('[BackgroundBridge] chrome.storage not ready, retrying...');
    setTimeout(() => initBackgroundBridgeIfEnabled(), 100);
    return;
  }

  try {
    const result = await chrome.storage.local.get(BRIDGE_STORAGE_KEY);
    const autoConnect = result[BRIDGE_STORAGE_KEY];
    if (autoConnect?.enabled) {
      console.log('[BackgroundBridge] Auto-connect enabled, starting...');
      await startBackgroundBridge(autoConnect.serverEndpoint);
    } else {
      console.log('[BackgroundBridge] Auto-connect disabled or not configured');
    }
  } catch (error) {
    console.error('[BackgroundBridge] Failed to init:', error);
  }
}

// Initialize background bridge on startup (with delay to ensure chrome APIs are ready)
setTimeout(() => initBackgroundBridgeIfEnabled(), 0);

// ==================== Keepalive Mechanism ====================
// Keep Service Worker alive when bridge is active
const KEEPALIVE_ALARM_NAME = 'midscene-bridge-keepalive';
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds (must be >= 0.4 in Chrome)

// Track if keepalive is currently enabled
let keepaliveEnabled = false;

async function setupKeepalive(shouldEnable?: boolean) {
  // Wait for chrome.storage to be available
  if (!chrome?.storage?.local) {
    console.log('[Keepalive] chrome.storage not ready, retrying...');
    setTimeout(() => setupKeepalive(shouldEnable), 100);
    return;
  }

  try {
    // Clear any existing alarm
    await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);

    // Determine if keepalive should be enabled
    let enabled = shouldEnable;
    if (enabled === undefined) {
      // Check if bridge auto-connect is enabled or bridge is currently active
      const result = await chrome.storage.local.get(BRIDGE_STORAGE_KEY);
      const autoConnect = result[BRIDGE_STORAGE_KEY];
      enabled =
        autoConnect?.enabled ||
        currentBridgeStatus === 'connected' ||
        currentBridgeStatus === 'listening';
    }

    if (enabled) {
      // Create periodic alarm to keep SW alive
      await chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
        periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
      });
      if (!keepaliveEnabled) {
        console.log('[Keepalive] Alarm set');
      }
      keepaliveEnabled = true;
    } else {
      if (keepaliveEnabled) {
        console.log('[Keepalive] Alarm cleared');
      }
      keepaliveEnabled = false;
    }
  } catch (error) {
    console.error('[Keepalive] Failed to setup keepalive:', error);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    // Just accessing chrome APIs keeps the SW alive
    // Only log in development mode to reduce noise
    if (process.env.NODE_ENV === 'development') {
      console.log('[Keepalive] Ping -', new Date().toLocaleTimeString());
    }
  }
});

// Setup keepalive on startup
void setupKeepalive().catch((error) => {
  console.error('[Keepalive] Failed to setup on startup:', error);
});

// Re-setup keepalive when auto-connect setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[BRIDGE_STORAGE_KEY]) {
    void setupKeepalive().catch((error) => {
      console.error('[Keepalive] Failed to setup after storage change:', error);
    });
  }
});

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
  } else if (port.name === 'bridge-ui') {
    // Bridge UI connection - for receiving status updates
    bridgePorts.add(port);
    console.log('[ServiceWorker] Bridge UI connected');

    // Send current status immediately
    port.postMessage({
      type: workerMessageTypes.BRIDGE_STATUS_CHANGED,
      status: currentBridgeStatus,
    });

    port.onDisconnect.addListener(() => {
      bridgePorts.delete(port);
      console.log('[ServiceWorker] Bridge UI disconnected');
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
      if (!chrome?.storage?.local) {
        sendResponse({ success: false, error: 'chrome.storage not available' });
        return true;
      }
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
      if (!chrome?.storage?.local) {
        sendResponse({ enabled: false, status: currentBridgeStatus });
        return true;
      }
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
