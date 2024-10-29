/// <reference types="chrome" />

export interface ScreenshotInfo {
  base64: string;
  dpr: number;
}

export const workerMessageTypes = {
  SAVE_SCREENSHOT: 'save-screenshot',
  GET_SCREENSHOT: 'get-screenshot',
};

// save screenshot
export interface WorkerRequestSaveScreenshot {
  screenshot: ScreenshotInfo;
  tabId: number;
  windowId: number;
}

export interface WorkerResponseSaveScreenshot {
  tabId: number;
  windowId: number;
}

// get screenshot
export interface WorkerRequestGetScreenshot {
  tabId: number;
  windowId: number;
}

export type WorkerResponseGetScreenshot = ScreenshotInfo;

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

export async function getScreenInfoOfTab(tabId: number): Promise<{
  dpr: number;
  width: number;
  height: number;
}> {
  const returnValue = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: () => {
      return {
        dpr: window.devicePixelRatio,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
    },
  });
  console.log('returnValue of getScreenInfoOfTab', returnValue);
  return returnValue[0].result!;
}

export async function getScreenshotBase64(windowId: number) {
  const base64 = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 70,
  });
  return base64;
}

export function getPlaygroundUrl(tabId: number, windowId: number) {
  return chrome.runtime.getURL(
    `./pages/playground.html?tab_id=${tabId}&window_id=${windowId}`,
  );
}

export async function activeTabId(): Promise<number> {
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

export async function currentWindowId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((window) => {
      if (window?.id) {
        resolve(window.id);
      } else {
        reject(new Error('No active window found'));
      }
    });
  });
}
