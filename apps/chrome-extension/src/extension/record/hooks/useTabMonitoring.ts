import { useEffect, useState } from 'react';
import { safeChromeAPI } from '../types';

export const useTabMonitoring = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

  // Get current active tab
  useEffect(() => {
    safeChromeAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setCurrentTab(tabs[0]);
      }
    });
  }, []);

  return {
    currentTab,
    setCurrentTab,
  };
};
