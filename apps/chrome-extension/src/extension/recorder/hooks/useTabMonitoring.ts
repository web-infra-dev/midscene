import { useCallback, useEffect, useState } from 'react';
import { dbManager } from '../../../utils/indexedDB';
import { recordLogger } from '../logger';
import { safeChromeAPI } from '../types';

export const useTabMonitoring = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [navigationState, setNavigationState] = useState<{
    isNavigating: boolean;
    lastUrl: string | null;
    lastTabId: number | null;
    wasRecordingBeforeNavigation: boolean;
  }>({
    isNavigating: false,
    lastUrl: null,
    lastTabId: null,
    wasRecordingBeforeNavigation: false,
  });

  // Save recording state before navigation
  const saveRecordingStateBeforeNavigation = useCallback(
    async (tabId: number, url?: string) => {
      try {
        const isRecording = await dbManager.getRecordingState();
        const currentSessionId = await dbManager.getCurrentSessionId();

        if (isRecording && currentSessionId) {
          recordLogger.info('Saving recording state before navigation', {
            tabId,
            url,
            sessionId: currentSessionId,
          });

          // Save navigation context for recovery
          await dbManager.setConfig({
            wasRecordingBeforeNavigation: true,
            lastRecordingTabId: tabId,
            lastRecordingUrl: url,
            lastRecordingSessionId: currentSessionId,
            lastNavigationTime: Date.now(),
          });

          setNavigationState((prev) => ({
            ...prev,
            isNavigating: true,
            lastUrl: url || null,
            lastTabId: tabId,
            wasRecordingBeforeNavigation: true,
          }));
        }
      } catch (error) {
        recordLogger.error(
          'Failed to save recording state before navigation',
          undefined,
          error,
        );
      }
    },
    [],
  );

  // Check for recording recovery after navigation
  const checkRecordingRecovery = useCallback(async (tab: chrome.tabs.Tab) => {
    try {
      const config = await dbManager.getConfig();
      const timeSinceNavigation = Date.now() - (config.lastNavigationTime || 0);

      // Only attempt recovery within 30 seconds of navigation and if flag is set
      if (
        config.wasRecordingBeforeNavigation &&
        config.lastRecordingSessionId &&
        timeSinceNavigation < 30000 &&
        timeSinceNavigation > 100 // Avoid immediate triggers
      ) {
        recordLogger.info('Potential recording recovery detected', {
          sessionId: config.lastRecordingSessionId,
          timeSinceNavigation,
          currentUrl: tab.url,
          lastUrl: config.lastRecordingUrl,
        });

        return {
          canRecover: true,
          sessionId: config.lastRecordingSessionId,
          lastUrl: config.lastRecordingUrl,
          timeSinceNavigation,
        };
      }
    } catch (error) {
      recordLogger.error(
        'Failed to check recording recovery',
        undefined,
        error,
      );
    }

    return { canRecover: false };
  }, []);

  // Get current active tab and set up listeners for tab changes
  useEffect(() => {
    const updateCurrentTab = async () => {
      safeChromeAPI.tabs.query(
        { active: true, currentWindow: true },
        async (tabs) => {
          if (tabs[0]) {
            recordLogger.info('Current tab found', {
              tabId: tabs[0].id,
              url: tabs[0].url,
            });
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
    const handleTabUpdated = async (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      // Only handle navigation detection for recording state preservation
      // Actual recording stop is handled by useRecordingControl to avoid duplication
      if (tab.active && changeInfo.status === 'loading' && changeInfo.url) {
        recordLogger.info('Navigation detected, saving recording state', {
          tabId,
          url: changeInfo.url,
        });
        await saveRecordingStateBeforeNavigation(tabId, changeInfo.url);
      }

      // Only update if it's the currently active tab and has completed loading
      if (tab.active && changeInfo.status === 'complete') {
        setCurrentTab(tab);

        // Reset navigation state when navigation completes
        setNavigationState((prev) => ({
          ...prev,
          isNavigating: false,
        }));
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
    navigationState,
    saveRecordingStateBeforeNavigation,
    checkRecordingRecovery,
  };
};
