import { useEffect, useState } from 'react';
import { safeChromeAPI } from '../types';

export const useTabMonitoring = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  // Get current active tab and set up listeners for tab changes
  useEffect(() => {
    const updateCurrentTab = () => {
      console.log('[TabMonitoring] Querying for current active tab');
      safeChromeAPI.tabs.query(
        { active: true, currentWindow: true },
        (tabs) => {
          if (tabs[0]) {
            console.log('[TabMonitoring] Current tab found:', {
              tabId: tabs[0].id,
              url: tabs[0].url,
              title: tabs[0].title,
            });
            setCurrentTab(tabs[0]);
          } else {
            console.warn('[TabMonitoring] No active tab found');
            setCurrentTab(null);
          }
        },
      );
    };

    // Initial query for current tab
    updateCurrentTab();

    // Listen for tab activation changes
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      console.log('[TabMonitoring] Tab activated:', {
        tabId: activeInfo.tabId,
      });
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
        console.log('[TabMonitoring] Active tab updated:', {
          tabId,
          url: tab.url,
          changeInfo,
        });
        setCurrentTab(tab);
      }
    };

    // Listen for window focus changes
    const handleWindowFocusChanged = (windowId: number) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        console.log('[TabMonitoring] Window focus changed:', { windowId });
        updateCurrentTab();
      }
    };

    // Add listeners
    safeChromeAPI.tabs.onActivated.addListener(handleTabActivated);
    safeChromeAPI.tabs.onUpdated.addListener(handleTabUpdated);
    safeChromeAPI.windows.onFocusChanged.addListener(handleWindowFocusChanged);

    // Cleanup listeners on unmount
    return () => {
      console.log('[TabMonitoring] Cleaning up tab listeners');
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
