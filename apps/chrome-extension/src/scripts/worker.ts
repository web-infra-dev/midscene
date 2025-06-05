/// <reference types="chrome" />

import type { WebUIContext } from '@midscene/web/utils';
import {
  type WorkerRequestGetContext,
  type WorkerRequestSaveContext,
  workerMessageTypes,
} from '../utils';

// console-browserify won't work in worker, so we need to use globalThis.console
const console = globalThis.console;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// cache data between sidepanel and fullscreen playground
const randomUUID = () => {
  return Math.random().toString(36).substring(2, 15);
};
const cacheMap = new Map<string, WebUIContext>();

// Store connected ports for message forwarding
const connectedPorts = new Set<chrome.runtime.Port>();

// Listen for connections from extension pages
chrome.runtime.onConnect.addListener((port) => {
  console.log('[ServiceWorker] Port connection attempt:', port.name);
  
  if (port.name === 'record-events') {
    connectedPorts.add(port);
    console.log('[ServiceWorker] Record events port connected, total ports:', connectedPorts.size);

    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
      console.log('[ServiceWorker] Record events port disconnected, remaining ports:', connectedPorts.size);
    });
  } else {
    console.log('[ServiceWorker] Unknown port name:', port.name);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ServiceWorker] Message received:', {
    action: request.action,
    type: request.type,
    senderTabId: sender.tab?.id,
    senderUrl: sender.tab?.url,
    hasData: !!request.data
  });

  // Handle screenshot capture request
  if (request.action === 'captureScreenshot') {
    console.log('[ServiceWorker] Processing screenshot capture request');
    if (sender.tab && sender.tab.id !== undefined) {
      chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error('[ServiceWorker] Failed to capture screenshot:', chrome.runtime.lastError);
            sendResponse(null);
          } else {
            console.log('[ServiceWorker] Screenshot captured successfully, size:', dataUrl ? dataUrl.length : 0);
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
    console.log('[ServiceWorker] Forwarding recording message to', connectedPorts.size, 'connected ports:', {
      action: request.action,
      dataLength: Array.isArray(request.data) ? request.data.length : 1,
      eventTypes: Array.isArray(request.data) ? request.data.map((e: any) => e.type) : [request.data?.type]
    });
    
    if (connectedPorts.size === 0) {
      console.warn('[ServiceWorker] No connected ports to forward recording events to');
    }
    
    connectedPorts.forEach((port) => {
      try {
        port.postMessage(request);
        console.log('[ServiceWorker] Message forwarded to port successfully');
      } catch (error) {
        console.error('[ServiceWorker] Failed to forward message to port:', error);
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
