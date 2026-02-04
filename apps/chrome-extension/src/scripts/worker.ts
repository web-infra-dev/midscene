/// <reference types="chrome" />

import { uuid } from '@midscene/shared/utils';
import type { WebUIContext } from '@midscene/web';
import { BridgeConnector, type BridgeStatus } from '../utils/bridgeConnector';
import { registerAlarmListener, safeSetupKeepalive } from '../utils/keepalive';
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
const BRIDGE_PERMISSION_KEY = 'midscene_bridge_permission';
let backgroundBridge: BridgeConnector | null = null;
let currentBridgeStatus: BridgeStatus = 'closed';

// Pending confirmation state
let pendingConfirmResolve: ((allowed: boolean) => void) | null = null;
let confirmWindowId: number | null = null;

// Store connected ports for bridge status updates
const bridgePorts = new Set<chrome.runtime.Port>();

// Status indicator colors
const STATUS_COLORS = {
  listening: '#F59E0B', // Yellow/Amber - waiting for connection
  connected: '#22C55E', // Green - actively connected
} as const;

// Cache for the original icon bitmap
let originalIconBitmap: ImageBitmap | null = null;

// Update extension icon with status indicator dot
async function updateExtensionBadge(status: BridgeStatus) {
  // Clear badge text (we use icon overlay instead)
  chrome.action.setBadgeText({ text: '' });

  try {
    if (status === 'listening' || status === 'connected') {
      const color =
        status === 'listening'
          ? STATUS_COLORS.listening
          : STATUS_COLORS.connected;
      console.log('[Badge] Setting dot with color:', color);
      await setIconWithDot(color);
    } else {
      console.log('[Badge] Restoring original icon for status:', status);
      await restoreOriginalIcon();
    }
  } catch (error) {
    console.error('[Badge] Failed to update icon:', error);
  }
}

// Draw a small dot on the icon
async function setIconWithDot(dotColor: string) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Load and cache the original icon
  if (!originalIconBitmap) {
    const response = await fetch(chrome.runtime.getURL('icon128.png'));
    const blob = await response.blob();
    originalIconBitmap = await createImageBitmap(blob);
  }

  // Draw original icon
  ctx.drawImage(originalIconBitmap, 0, 0, size, size);

  // Draw status dot (bottom-right corner)
  const dotRadius = 20;
  const dotX = size - dotRadius - 4;
  const dotY = size - dotRadius - 4;

  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // Set the modified icon with size specification
  const imageData = ctx.getImageData(0, 0, size, size);
  await chrome.action.setIcon({
    imageData: { 128: imageData },
  });
}

// Restore the original icon without dot
async function restoreOriginalIcon() {
  const size = 128;

  // Load original icon if not cached
  if (!originalIconBitmap) {
    const response = await fetch(chrome.runtime.getURL('icon128.png'));
    const blob = await response.blob();
    originalIconBitmap = await createImageBitmap(blob);
  }

  // Draw original icon without dot
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(originalIconBitmap, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);

  await chrome.action.setIcon({
    imageData: { 128: imageData },
  });
}

// Broadcast bridge status to all connected UI pages
function broadcastBridgeStatus(status: BridgeStatus) {
  // Update extension icon badge
  console.log('[Badge] Updating icon for status:', status);
  void updateExtensionBadge(status);

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

// Show connection confirm dialog
async function showConnectionConfirmDialog(
  serverEndpoint?: string,
): Promise<boolean> {
  const CONFIRM_TIMEOUT = 30000; // 30 seconds

  // Check if already allowed
  try {
    const result = await chrome.storage.local.get(BRIDGE_PERMISSION_KEY);
    const permission = result[BRIDGE_PERMISSION_KEY];
    if (permission?.alwaysAllow) {
      console.log('[BackgroundBridge] Connection auto-allowed by user setting');
      return true;
    }
  } catch (error) {
    console.error('[BackgroundBridge] Failed to check permission:', error);
  }

  // Create confirm popup - centered on screen
  const serverUrl = serverEndpoint || 'ws://localhost:3766';
  const popupWidth = 420;
  const popupHeight = 340;

  // Get current window to center the popup relative to it
  let left: number | undefined;
  let top: number | undefined;

  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (
      currentWindow.left !== undefined &&
      currentWindow.top !== undefined &&
      currentWindow.width !== undefined &&
      currentWindow.height !== undefined
    ) {
      left = Math.round(
        currentWindow.left + (currentWindow.width - popupWidth) / 2,
      );
      top = Math.round(
        currentWindow.top + (currentWindow.height - popupHeight) / 2,
      );
    }
  } catch (e) {
    console.warn('[BackgroundBridge] Failed to get current window:', e);
  }

  const confirmWindow = await chrome.windows.create({
    url: chrome.runtime.getURL(
      `confirm.html?serverUrl=${encodeURIComponent(serverUrl)}`,
    ),
    type: 'popup',
    width: popupWidth,
    height: popupHeight,
    left,
    top,
    focused: true,
  });

  confirmWindowId = confirmWindow.id || null;

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
    let resolved = false;

    // Timeout auto-deny
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        pendingConfirmResolve = null;
        if (confirmWindowId) {
          chrome.windows.remove(confirmWindowId).catch(() => {});
          confirmWindowId = null;
        }
        resolve(false);
      }
    }, CONFIRM_TIMEOUT);

    // Listen for window close (user clicked X)
    const onRemoved = (windowId: number) => {
      if (windowId === confirmWindowId && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        pendingConfirmResolve = null;
        confirmWindowId = null;
        chrome.windows.onRemoved.removeListener(onRemoved);
        resolve(false);
      }
    };
    chrome.windows.onRemoved.addListener(onRemoved);

    // Store cleanup function for message handler
    const cleanup = () => {
      resolved = true;
      clearTimeout(timeout);
      pendingConfirmResolve = null;
      confirmWindowId = null;
      chrome.windows.onRemoved.removeListener(onRemoved);
    };

    // Override resolve to include cleanup
    pendingConfirmResolve = (allowed: boolean) => {
      cleanup();
      resolve(allowed);
    };
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
      safeSetupKeepalive({
        shouldEnable,
        storageKey: BRIDGE_PERMISSION_KEY,
        currentBridgeStatus,
      });
    },
    serverEndpoint,
    () => showConnectionConfirmDialog(serverEndpoint),
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
    // Update keepalive
    safeSetupKeepalive({
      storageKey: BRIDGE_PERMISSION_KEY,
      currentBridgeStatus,
    });
  }
}

async function initBackgroundBridge(): Promise<void> {
  // Wait for chrome.storage to be available
  if (!chrome?.storage?.local) {
    console.log('[BackgroundBridge] chrome.storage not ready, retrying...');
    setTimeout(() => initBackgroundBridge(), 100);
    return;
  }

  try {
    console.log('[BackgroundBridge] Auto-starting background bridge...');
    await startBackgroundBridge();
  } catch (error) {
    console.error('[BackgroundBridge] Failed to init:', error);
  }
}

// Initialize background bridge on startup (with delay to ensure chrome APIs are ready)
setTimeout(() => initBackgroundBridge(), 0);

// ==================== Keepalive Mechanism ====================
// Register alarm listener for keepalive pings
registerAlarmListener();

// Setup keepalive on startup - always enable since we auto-start listening
safeSetupKeepalive({
  shouldEnable: true,
  storageKey: BRIDGE_PERMISSION_KEY,
  currentBridgeStatus,
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
    case workerMessageTypes.BRIDGE_GET_PERMISSION: {
      if (!chrome?.storage?.local) {
        sendResponse({ alwaysAllow: false, status: currentBridgeStatus });
        return true;
      }
      chrome.storage.local
        .get(BRIDGE_PERMISSION_KEY)
        .then((result) => {
          const permission = result[BRIDGE_PERMISSION_KEY] || {
            alwaysAllow: false,
          };
          sendResponse({ ...permission, status: currentBridgeStatus });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    case workerMessageTypes.BRIDGE_RESET_PERMISSION: {
      if (!chrome?.storage?.local) {
        sendResponse({ success: false, error: 'chrome.storage not available' });
        return true;
      }
      chrome.storage.local
        .remove(BRIDGE_PERMISSION_KEY)
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }
    case workerMessageTypes.BRIDGE_CONFIRM_RESPONSE: {
      const { allowed, alwaysAllow } = request.payload || {};
      console.log(
        '[BackgroundBridge] Received confirm response:',
        allowed,
        alwaysAllow,
      );

      // Save "always allow" preference if user checked it
      if (allowed && alwaysAllow && chrome?.storage?.local) {
        chrome.storage.local.set({
          [BRIDGE_PERMISSION_KEY]: { alwaysAllow: true },
        });
      }

      // Resolve pending confirmation
      if (pendingConfirmResolve) {
        pendingConfirmResolve(allowed);
      }

      sendResponse({ success: true });
      break;
    }
    default:
      sendResponse({ error: 'Unknown message type' });
      break;
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Reload all tabs after extension is installed or updated (development only)
// This ensures content scripts are properly injected during development
chrome.runtime.onInstalled.addListener(async (details) => {
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
