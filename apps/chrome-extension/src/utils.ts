/// <reference types="chrome" />
import type { PlaygroundResult } from '@midscene/visualizer';
import type { WebUIContext } from '@midscene/web/utils';

export const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
};

// save screenshot
export interface WorkerRequestSaveContext {
  context: WebUIContext;
}

export interface WorkerResponseSaveContext {
  id: string;
}

// get screenshot
export interface WorkerRequestGetContext {
  id: string;
}

export interface WorkerResponseGetContext {
  context: WebUIContext;
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

export function getPlaygroundUrl(cacheContextId: string) {
  return chrome.runtime.getURL(
    `./pages/playground.html?cache_context_id=${cacheContextId}`,
  );
}

export async function activeTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.[0]) {
        resolve(tabs[0]);
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

export function getExtensionVersion() {
  return chrome.runtime?.getManifest?.()?.version || 'unknown';
}

// Playground storage utilities
const MSG_STORAGE_KEY = 'midscene_playground_msgs';
const RESULT_STORAGE_PREFIX = 'midscene_result_';
const RESULT_INDEX_KEY = 'midscene_result_index';
const MAX_STORED_RESULTS = 50;

// store result to localStorage
export const storeResult = (resultId: string, result: PlaygroundResult) => {
  try {
    const storageKey = `${RESULT_STORAGE_PREFIX}${resultId}`;
    const serializedResult = JSON.stringify(result);

    // store result data
    localStorage.setItem(storageKey, serializedResult);

    // verify storage worked
    const verification = localStorage.getItem(storageKey);
    if (!verification) {
      throw new Error(
        'Storage verification failed - item not found after storing',
      );
    }

    // update result index
    const storedIndex = localStorage.getItem(RESULT_INDEX_KEY);
    const resultIndex: string[] = storedIndex ? JSON.parse(storedIndex) : [];

    // add new result id
    resultIndex.push(resultId);

    // if over max count, remove oldest result
    if (resultIndex.length > MAX_STORED_RESULTS) {
      const removedId = resultIndex.shift();
      if (removedId) {
        localStorage.removeItem(`${RESULT_STORAGE_PREFIX}${removedId}`);
      }
    }

    // save updated index
    localStorage.setItem(RESULT_INDEX_KEY, JSON.stringify(resultIndex));
  } catch (e) {
    console.error('Failed to store result:', e);
  }
};

// get result from localStorage
export const getStoredResult = (resultId: string): PlaygroundResult | null => {
  try {
    const storageKey = `${RESULT_STORAGE_PREFIX}${resultId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      console.warn('No stored data found for key:', storageKey);
      return null;
    }

    const result = JSON.parse(stored);
    return result;
  } catch (e) {
    console.error('Failed to get stored result:', e);
    return null;
  }
};

// clear all stored results
export const clearStoredResults = () => {
  try {
    const storedIndex = localStorage.getItem(RESULT_INDEX_KEY);
    if (storedIndex) {
      const resultIndex: string[] = JSON.parse(storedIndex);
      resultIndex.forEach((resultId) => {
        localStorage.removeItem(`${RESULT_STORAGE_PREFIX}${resultId}`);
      });
    }
    localStorage.removeItem(RESULT_INDEX_KEY);
  } catch (e) {
    console.warn('Failed to clear stored results:', e);
  }
};

// get messages from localStorage with default item fallback
export const getMsgsFromStorage = <T>(defaultItem: T) => {
  const stored = localStorage.getItem(MSG_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored).map((item: any) => {
        const restoredItem = {
          ...defaultItem, // use default fields, then override
          ...item,
          timestamp: new Date(item.timestamp),
        };

        if (item.type === 'result') {
          const storedResult = getStoredResult(item.id);
          restoredItem.result = storedResult || {};
        }

        return restoredItem;
      });
    } catch {
      return [];
    }
  }
  return [];
};

// store messages to localStorage
export const storeMsgsToStorage = (infoList: any[]) => {
  try {
    const msgs = infoList
      .filter(
        (item) =>
          (item.type === 'user' ||
            item.type === 'result' ||
            item.type === 'system' ||
            item.type === 'progress' ||
            item.type === 'separator') &&
          item.id !== 'welcome',
      )
      .map((item) => {
        const lightItem = {
          ...item,
          result: undefined, // remove big result data
        };

        return lightItem;
      });

    localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(msgs));
  } catch (e) {
    console.warn('Failed to store messages:', e);
    // if store failed, try to clear some old data
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.log('Storage quota exceeded, clearing old results...');
      clearStoredResults();
      // try again, only store recent messages
      try {
        const recentMsgs = infoList
          .filter(
            (item) =>
              (item.type === 'user' ||
                item.type === 'result' ||
                item.type === 'system' ||
                item.type === 'progress' ||
                item.type === 'separator') &&
              item.id !== 'welcome',
          )
          .slice(-20) // only keep recent 20 messages
          .map((item) => {
            const lightItem = {
              ...item,
              result: undefined,
            };

            // if result type and has real result data, record resultId
            if (item.type === 'result' && item.result) {
              lightItem.resultId = item.resultId || item.id;
            }

            return lightItem;
          });

        localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(recentMsgs));
      } catch (retryError) {
        console.error(
          'Failed to store messages even after cleanup:',
          retryError,
        );
      }
    }
  }
};

// clear stored messages
export const clearStoredMessages = () => {
  localStorage.removeItem(MSG_STORAGE_KEY);
  clearStoredResults();
};

// Bridge storage utilities
const BRIDGE_MSG_STORAGE_KEY = 'midscene_bridge_msgs';

// get bridge messages from localStorage
export const getBridgeMsgsFromStorage = () => {
  const stored = localStorage.getItem(BRIDGE_MSG_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored).map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
    } catch {
      return [];
    }
  }
  return [];
};

// store bridge messages to localStorage
export const storeBridgeMsgsToStorage = (messageList: any[]) => {
  try {
    const msgs = messageList
      .filter((item) => item.type === 'system' || item.type === 'status')
      .map((item) => ({
        id: item.id,
        type: item.type,
        content: item.content,
        timestamp: item.timestamp,
        time: item.time,
      }));

    localStorage.setItem(BRIDGE_MSG_STORAGE_KEY, JSON.stringify(msgs));
  } catch (e) {
    console.warn('Failed to store bridge messages:', e);
  }
};

// clear stored bridge messages
export const clearStoredBridgeMessages = () => {
  localStorage.removeItem(BRIDGE_MSG_STORAGE_KEY);
};
