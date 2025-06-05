import { useEffect, useState } from 'react';
import { safeChromeAPI } from '../types';

export const useTabMonitoring = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  // Get current active tab
  useEffect(() => {
    console.log('[TabMonitoring] Querying for current active tab');
    safeChromeAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log('[TabMonitoring] Current tab found:', { 
          tabId: tabs[0].id, 
          url: tabs[0].url,
          title: tabs[0].title 
        });
        setCurrentTab(tabs[0]);
      } else {
        console.warn('[TabMonitoring] No active tab found');
        setCurrentTab(null);
      }
    });
  }, []);

  return {
    currentTab,
    setCurrentTab,
  };
};
