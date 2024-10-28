/// <reference types="chrome" />

import {
  type WorkerRequestSaveContext,
  type WorkerResponseSaveContext,
  getActivePageContext,
  getPlaygroundUrl,
  sendToWorker,
  workerMessageTypes,
} from './utils';

// const scriptFileToRetrieve = './scripts/htmlElement.js';

async function getTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.[0]?.id) {
        resolve(tabs[0].id);
      } else {
        reject(new Error('No active tab found'));
      }
    });
  });
}

// get the context, send it to the worker, and open the playground
document.getElementById('retrieve')!.addEventListener('click', async () => {
  const tabId = await getTabId();
  // const pageContext = await getActivePageContext(tabId);

  // const workerResponse = await sendToWorker<
  //   WorkerRequestSaveContext,
  //   WorkerResponseSaveContext
  // >(workerMessageTypes.SAVE_CONTEXT, { context: pageContext });

  // console.log('workerResponse', workerResponse);
  const url = getPlaygroundUrl(tabId);
  console.log('url', url);
  chrome.tabs.create({
    url,
    active: true,
  });
});
