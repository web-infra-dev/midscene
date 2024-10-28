/// <reference types="chrome" />

import {
  type WorkerResponseGetContext,
  type WorkerResponseSaveContext,
  workerMessageTypes,
} from './utils';

console.log('worker launched');

let contextId = 0;
const contextMap = new Map<string, object>();
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in service worker:', request);

  switch (request.type) {
    case workerMessageTypes.SAVE_CONTEXT: {
      const id = `${contextId++}`;
      contextMap.set(id, request.payload);
      console.log('will send response');
      sendResponse({ id } as WorkerResponseSaveContext);
      break;
    }
    case workerMessageTypes.GET_CONTEXT:
      console.log('will send response');
      sendResponse({
        context: contextMap.get(request.payload) as WorkerResponseGetContext,
      });
      break;
    default:
      console.log('will send response');
      sendResponse({ error: 'Unknown message type' });
      break;
  }
});
