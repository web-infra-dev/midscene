/// <reference types="chrome" />

// View modes
export type ViewMode = 'list' | 'detail';

// Message types for content script communication
export interface RecordMessage {
  action: 'start' | 'stop' | 'event' | 'events';
  data?: any;
}

// Chrome API safety check
export const isChromeExtension = (): boolean => {
  try {
    return !!(
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      chrome.runtime.id &&
      chrome.tabs &&
      chrome.scripting
    );
  } catch (error) {
    return false;
  }
};

// Safe Chrome API wrappers
export const safeChromeAPI = {
  tabs: {
    query: (
      queryInfo: chrome.tabs.QueryInfo,
      callback: (tabs: chrome.tabs.Tab[]) => void,
    ) => {
      if (isChromeExtension()) {
        chrome.tabs.query(queryInfo, callback);
      } else {
        // Mock tab for non-extension environment
        callback([
          {
            id: 1,
            title: 'Mock Tab (Chrome Extension Required)',
            url: window.location.href,
            active: true,
            highlighted: false,
            pinned: false,
            audible: false,
            discarded: false,
            autoDiscardable: true,
            mutedInfo: { muted: false },
            incognito: false,
            width: window.innerWidth,
            height: window.innerHeight,
            status: 'complete' as const,
            index: 0,
            windowId: 1,
            groupId: -1,
            openerTabId: undefined,
            favIconUrl: undefined,
            sessionId: undefined,
            pendingUrl: undefined,
            selected: false,
          } as chrome.tabs.Tab,
        ]);
      }
    },
    sendMessage: async (tabId: number, message: any): Promise<any> => {
      if (isChromeExtension()) {
        return chrome.tabs.sendMessage(tabId, message);
      } else {
        throw new Error('Chrome extension API not available');
      }
    },
    onUpdated: {
      addListener: (
        callback: (
          tabId: number,
          changeInfo: chrome.tabs.TabChangeInfo,
          tab: chrome.tabs.Tab,
        ) => void,
      ) => {
        if (isChromeExtension()) {
          chrome.tabs.onUpdated.addListener(callback);
        }
      },
      removeListener: (
        callback: (
          tabId: number,
          changeInfo: chrome.tabs.TabChangeInfo,
          tab: chrome.tabs.Tab,
        ) => void,
      ) => {
        if (isChromeExtension()) {
          chrome.tabs.onUpdated.removeListener(callback);
        }
      },
    },
  },
  runtime: {
    connect: (connectInfo?: chrome.runtime.ConnectInfo) => {
      if (isChromeExtension()) {
        return chrome.runtime.connect(connectInfo);
      } else {
        // Mock port for non-extension environment
        return {
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
          },
          disconnect: () => {},
          postMessage: () => {},
        };
      }
    },
    onMessage: {
      addListener: (
        callback: (
          message: any,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: any) => void,
        ) => void,
      ) => {
        if (isChromeExtension()) {
          chrome.runtime.onMessage.addListener(callback);
        }
      },
      removeListener: (
        callback: (
          message: any,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: any) => void,
        ) => void,
      ) => {
        if (isChromeExtension()) {
          chrome.runtime.onMessage.removeListener(callback);
        }
      },
    },
  },
  scripting: {
    executeScript: async (injection: any): Promise<any[]> => {
      if (isChromeExtension()) {
        return chrome.scripting.executeScript(injection);
      } else {
        throw new Error('Chrome extension API not available');
      }
    },
  },
}; 