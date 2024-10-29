/// <reference types="chrome" />

import {
  type ScreenshotInfo,
  type WorkerRequestGetScreenshot,
  type WorkerRequestSaveScreenshot,
  type WorkerResponseGetScreenshot,
  workerMessageTypes,
} from './utils';

const cacheMap = new Map<string, ScreenshotInfo>();
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in service worker:', request);

  switch (request.type) {
    case workerMessageTypes.SAVE_SCREENSHOT: {
      const payload: WorkerRequestSaveScreenshot = request.payload;
      const { tabId, windowId, screenshot } = payload;
      const id = `${tabId}-${windowId}`;
      cacheMap.set(id, screenshot);
      sendResponse({ tabId, windowId });
      break;
    }
    case workerMessageTypes.GET_SCREENSHOT: {
      const payload: WorkerRequestGetScreenshot = request.payload;
      const { tabId, windowId } = payload;
      const id = `${tabId}-${windowId}`;
      const screenshot = cacheMap.get(id) as ScreenshotInfo;
      if (!screenshot) {
        sendResponse({ error: 'Screenshot not found' });
      } else {
        const response: WorkerResponseGetScreenshot = screenshot;
        sendResponse(response);
      }

      break;
    }
    default:
      console.log('will send response');
      sendResponse({ error: 'Unknown message type' });
      break;
  }
});
