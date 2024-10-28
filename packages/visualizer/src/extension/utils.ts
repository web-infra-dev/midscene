/// <reference types="chrome" />

const scriptFileToRetrieve = './scripts/htmlElement.js';

export const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
};

export interface WorkerRequestSaveContext {
  context: object;
}

export interface WorkerResponseSaveContext {
  id: string;
}

export interface WorkerRequestGetContext {
  id: string;
}

export interface WorkerResponseGetContext {
  context: object;
}

export async function sendToWorker<Payload, Result = any>(
  type: string,
  payload: Payload,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (response.error) {
        reject(response.error);
      } else {
        resolve(response);
      }
    });
  });
}

export async function getActivePageContext(tabId: number) {
  const injectResult = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [scriptFileToRetrieve],
  });
  console.log('injectResult', injectResult);

  // call and retrieve the result
  const returnValue = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () =>
      (window as any).midscene_element_inspector.webExtractTextWithPosition(),
  });

  return returnValue[0].result;
}

export function getPlaygroundUrl(tabId: number) {
  return chrome.runtime.getURL(`./pages/playground.html?tab_id=${tabId}`);
}
