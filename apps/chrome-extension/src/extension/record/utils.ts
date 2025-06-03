import { message } from 'antd';
import { safeChromeAPI, isChromeExtension } from './types';

// Generate default session name with current time
export const generateDefaultSessionName = () => {
  return new Date()
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
};

// Check if content script is injected
export const checkContentScriptInjected = async (
  tabId: number,
): Promise<boolean> => {
  if (!isChromeExtension()) return false;

  try {
    const response = await safeChromeAPI.tabs.sendMessage(tabId, {
      action: 'ping',
    });
    return response?.success === true;
  } catch (error) {
    return false;
  }
};

// Re-inject script if needed
export const ensureScriptInjected = async (currentTab: chrome.tabs.Tab | null) => {
  if (!isChromeExtension() || !currentTab?.id) return false;

  const isInjected = await checkContentScriptInjected(currentTab.id);
  if (!isInjected) {
    await injectScript(currentTab);
  }
  return true;
};

// Inject content script
export const injectScript = async (currentTab: chrome.tabs.Tab | null) => {
  if (!isChromeExtension()) {
    message.error(
      'Chrome extension environment required for script injection',
    );
    return;
  }

  if (!currentTab?.id) {
    message.error('No active tab found');
    return;
  }

  try {
    console.log('injecting record script');
    // Inject the record script first
    await safeChromeAPI.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['scripts/record-iife.js'],
    });

    // Then inject the content script wrapper
    await safeChromeAPI.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['scripts/event-recorder-bridge.js'],
    });

    message.success('Recording script injected successfully');
  } catch (error) {
    console.error('Failed to inject script:', error);
    if (error instanceof Error && error.message.includes('Cannot access')) {
      message.error(
        'Cannot inject script on this page (Chrome internal pages are restricted)',
      );
    } else if (
      error instanceof Error &&
      error.message.includes('chrome-extension://')
    ) {
      message.error('Cannot inject script on Chrome extension pages');
    } else if (
      error instanceof Error &&
      error.message.includes('chrome://')
    ) {
      message.error('Cannot inject script on Chrome system pages');
    } else {
      message.error(`Failed to inject recording script: ${error}`);
    }
  }
};

// Export session events to file
export const exportEventsToFile = (events: any[], sessionName: string) => {
  if (events.length === 0) {
    message.warning('No events to export');
    return;
  }

  const dataStr = JSON.stringify(events, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${sessionName}-${new Date().toISOString().slice(0, 19)}.json`;
  link.click();

  URL.revokeObjectURL(url);
  message.success(`Events from "${sessionName}" exported successfully`);
}; 