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
  if (port.name === 'record-events') {
    connectedPorts.add(port);
    
    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in service worker:', request);

  // Handle screenshot capture request
  if (request.action === 'captureScreenshot') {
    if (sender.tab && sender.tab.id !== undefined) {
      chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to capture screenshot:', chrome.runtime.lastError);
          sendResponse(null);
        } else {
          sendResponse(dataUrl);
        }
      });
      return true; // Keep the message channel open for async response
    } else {
      sendResponse(null);
      return true;
    }
  }
  
  // Forward recording events to connected extension pages
  if (request.action === 'events' || request.action === 'event') {
    connectedPorts.forEach(port => {
      port.postMessage(request);
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


