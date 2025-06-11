import { useEffect, useState } from 'react';
import { recordLogger } from '../logger';
import { safeChromeAPI } from '../types';

export const useTabMonitoring = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  // Get current active tab and set up listeners for tab changes
  useEffect(() => {
    const updateCurrentTab = () => {
      safeChromeAPI.tabs.query(
        { active: true, currentWindow: true },
        (tabs) => {
          if (tabs[0]) {
            recordLogger.info('Current tab found', { tabId: tabs[0].id });
            setCurrentTab(tabs[0]);
          } else {
            recordLogger.warn('No active tab found');
            setCurrentTab(null);
          }
        },
      );
    };

    // Initial query for current tab
    updateCurrentTab();

    // Listen for tab activation changes
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      recordLogger.info('Tab activated', { tabId: activeInfo.tabId });
      updateCurrentTab();
    };

    // Listen for tab updates (URL changes, etc.)
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      // Only update if it's the currently active tab and has completed loading
      if (tab.active && changeInfo.status === 'complete') {
        recordLogger.info('Active tab updated', { tabId });
        setCurrentTab(tab);
      }
    };

    // Listen for window focus changes
    const handleWindowFocusChanged = (windowId: number) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        updateCurrentTab();
      }
    };

    // Add listeners
    safeChromeAPI.tabs.onActivated.addListener(handleTabActivated);
    safeChromeAPI.tabs.onUpdated.addListener(handleTabUpdated);
    safeChromeAPI.windows.onFocusChanged.addListener(handleWindowFocusChanged);

    // Cleanup listeners on unmount
    return () => {
      safeChromeAPI.tabs.onActivated.removeListener(handleTabActivated);
      safeChromeAPI.tabs.onUpdated.removeListener(handleTabUpdated);
      safeChromeAPI.windows.onFocusChanged.removeListener(
        handleWindowFocusChanged,
      );
    };
  }, []);

  return {
    currentTab,
    setCurrentTab,
  };
};
