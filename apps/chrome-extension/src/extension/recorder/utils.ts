import { AIActionType, callToGetJSONObject } from '@midscene/core/ai-model';
import { message } from 'antd';

import type { ChromeRecordedEvent } from '@midscene/recorder';
import { recordLogger } from './logger';
import { isChromeExtension, safeChromeAPI } from './types';

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
    const isInjected = response?.success === true;
    if (!isInjected) {
      recordLogger.warn('Content script not injected', { tabId });
    }
    return isInjected;
  } catch (error: any) {
    // More specific error handling for common scenarios
    const errorMsg = error?.message || '';

    if (errorMsg.includes('Receiving end does not exist')) {
      recordLogger.debug(
        'Content script not available - tab may be refreshing or on restricted page',
        { tabId },
      );
    } else if (errorMsg.includes('Cannot access')) {
      recordLogger.debug('Cannot access tab - may be Chrome internal page', {
        tabId,
      });
    } else {
      recordLogger.warn('Content script check failed', {
        tabId,
        error: errorMsg,
      });
    }
    return false;
  }
};

// Re-inject script if needed
export const ensureScriptInjected = async (
  currentTab: chrome.tabs.Tab | null,
) => {
  if (!isChromeExtension() || !currentTab?.id) {
    recordLogger.error(
      'Cannot ensure script injection - invalid environment or tab',
    );
    return false;
  }

  const isInjected = await checkContentScriptInjected(currentTab.id);

  if (!isInjected) {
    recordLogger.info('Injecting script', { tabId: currentTab.id });
    await injectScript(currentTab);
  }
  return true;
};

// Inject content script
export const injectScript = async (currentTab: chrome.tabs.Tab | null) => {
  if (!isChromeExtension()) {
    message.error('Chrome extension environment required for script injection');
    return;
  }

  if (!currentTab?.id) {
    message.error('No active tab found');
    return;
  }

  try {
    // Inject the record script first
    await safeChromeAPI.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['scripts/recorder-iife.js'],
    });

    // Then inject the content script wrapper
    await safeChromeAPI.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['scripts/event-recorder-bridge.js'],
    });

    recordLogger.success('Script injected', { tabId: currentTab.id });
    message.success('Recording script injected successfully');
  } catch (error) {
    recordLogger.error(
      'Failed to inject script',
      { tabId: currentTab.id },
      error,
    );
    if (error instanceof Error && error.message.includes('Cannot access')) {
      message.error(
        'Cannot inject script on this page (Chrome internal pages are restricted)',
      );
    } else if (
      error instanceof Error &&
      error.message.includes('chrome-extension://')
    ) {
      message.error('Cannot inject script on Chrome extension pages');
    } else if (error instanceof Error && error.message.includes('chrome://')) {
      message.error('Cannot inject script on Chrome system pages');
    } else {
      message.error(`Failed to inject recording script: ${error}`);
    }
  }
};

// Export session events to file
export const exportEventsToFile = (
  events: ChromeRecordedEvent[],
  sessionName: string,
) => {
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

export const generateSessionName = () => {
  // Auto-create session with timestamp name
  const sessionName = new Date()
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
  return sessionName;
};

// Function to get screenshots from events
const getScreenshotsForLLM = (
  events: ChromeRecordedEvent[],
  maxScreenshots = 1,
): string[] => {
  // Find events with screenshots, prioritizing navigation and click events
  const eventsWithScreenshots = events.filter(
    (event) =>
      event.screenshotBefore ||
      event.screenshotAfter ||
      event.screenshotWithBox,
  );

  // Sort them by priority (navigation first, then clicks, then others)
  const sortedEvents = [...eventsWithScreenshots].sort((a, b) => {
    if (a.type === 'navigation' && b.type !== 'navigation') return -1;
    if (a.type !== 'navigation' && b.type === 'navigation') return 1;
    if (a.type === 'click' && b.type !== 'click') return -1;
    if (a.type !== 'click' && b.type === 'click') return 1;
    return 0;
  });

  // Extract up to maxScreenshots screenshots
  const screenshots: string[] = [];
  for (const event of sortedEvents) {
    // Prefer the most informative screenshot
    const screenshot =
      event.screenshotWithBox ||
      event.screenshotAfter ||
      event.screenshotBefore;
    if (screenshot && !screenshots.includes(screenshot)) {
      screenshots.push(screenshot);
      if (screenshots.length >= maxScreenshots) break;
    }
  }

  return screenshots;
};

// Generate a title and description for recording using AI based on events
export const generateRecordTitle = async (
  events: ChromeRecordedEvent[],
): Promise<{
  title?: string;
  description?: string;
}> => {
  try {
    // Only proceed if we have events
    if (!events.length) {
      return {};
    }

    // If there's very little data, use simple fallback
    // if (events.length < 5) {
    //   return {
    //     title: generateSessionName(),
    //     description: `Recording with ${events.length} action${events.length === 1 ? '' : 's'}`,
    //   };
    // }

    // Prepare data for LLM
    const navigationEvents = events.filter(
      (event) => event.type === 'navigation',
    );
    const clickEvents = events.filter((event) => event.type === 'click');
    const inputEvents = events.filter((event) => event.type === 'input');

    // Extract page titles and URLs from navigation events
    const pageTitles = navigationEvents
      .map((event) => event.title)
      .filter(Boolean);
    const urls = navigationEvents.map((event) => event.url).filter(Boolean);

    // Extract element descriptions from click and input events
    const clickDescriptions = clickEvents
      .map((event) => event.elementDescription)
      .filter(Boolean);

    const inputDescriptions = inputEvents
      .map((event) => `Input "${event.value}" in ${event.elementDescription}`)
      .filter(Boolean);

    // Create a summary object for LLM
    const summary = {
      pageCount: navigationEvents.length,
      pageTitles: pageTitles.slice(0, 3),
      urls: urls.slice(0, 3),
      clickCount: clickEvents.length,
      inputCount: inputEvents.length,
      totalActions: events.length,
      clickDescriptions: clickDescriptions.slice(0, 5),
      inputDescriptions: inputDescriptions.slice(0, 5),
      firstUrl: urls[0] || '',
      lastUrl: urls[urls.length - 1] || '',
    };

    try {
      // Get screenshots for visual context
      const screenshots = getScreenshotsForLLM(events);

      // Create the message content
      const messageContent: Array<string | Record<string, any>> = [
        {
          type: 'text',
          text: `Generate a concise title (5-7 words) and brief description (1-2 sentences) for a browser recording session with the following events:\n\n${JSON.stringify(summary, null, 2)}\n\nRespond with a JSON object containing "title" and "description" fields. The title should be action-oriented and highlight the main task accomplished. The description should provide slightly more detail about what was done.`,
        },
      ];

      // Add screenshots if available
      if (screenshots.length > 0) {
        messageContent.unshift({
          type: 'text',
          text: 'Here are screenshots from the recording session to help you understand the context:',
        });

        screenshots.forEach((screenshot) => {
          messageContent.unshift({
            type: 'image_url',
            image_url: {
              url: screenshot,
            },
          });
        });
      }

      // Use LLM to generate title and description
      const prompt = [
        {
          role: 'system',
          content:
            'You are an AI that generates concise, descriptive titles and descriptions for browser recording sessions. Your goal is to capture the essence of what the user accomplished in a clear, task-oriented way.',
        },
        {
          role: 'user',
          content: messageContent,
        },
      ];

      const response = await callToGetJSONObject(
        prompt,
        AIActionType.EXTRACT_DATA,
      );
      if (response?.content) {
        return {
          title: (response.content as any).title as string,
          description: (response.content as any).description as string,
        };
      }
    } catch (llmError) {
      console.error('Error using LLM for title generation:', llmError);
    }

    // Fallback return if LLM fails
    return {
      title: generateSessionName(),
      description: '',
    };
  } catch (error) {
    console.error('Error generating recording title:', error);
    return {
      title: generateSessionName(),
      description: '',
    };
  }
};

// Cleanup previous recording sessions by sending stop messages to all tabs
export const cleanupPreviousRecordings = async () => {
  if (!isChromeExtension()) {
    return;
  }

  try {
    recordLogger.info('Cleaning up previous recordings');

    // Get all tabs
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      safeChromeAPI.tabs.query({}, resolve);
    });

    // Send cleanup message to all tabs
    const cleanupPromises = tabs.map(async (tab) => {
      if (!tab.id) return;

      try {
        await safeChromeAPI.tabs.sendMessage(tab.id, {
          action: 'stop',
        });
      } catch (error) {
        // Ignore errors for tabs that don't have our content script
      }
    });

    await Promise.allSettled(cleanupPromises);
    recordLogger.success('Previous recordings cleaned up');
  } catch (error) {
    recordLogger.error('Error during recording cleanup', undefined, error);
  }
};
export const diagnoseRecordingChain = async (
  currentTab: chrome.tabs.Tab | null,
): Promise<{ issues: string[]; info: string[] }> => {
  recordLogger.info('Starting recording chain diagnosis');

  const issues: string[] = [];
  const info: string[] = [];

  // Check 1: Extension environment
  if (!isChromeExtension()) {
    issues.push('Not in Chrome extension environment');
    return { issues, info };
  }
  info.push('✓ Chrome extension environment detected');

  // Check 2: Current tab
  if (!currentTab || !currentTab.id) {
    issues.push('No active tab or invalid tab ID');
    return { issues, info };
  }
  info.push(`✓ Active tab found: ${currentTab.url} (ID: ${currentTab.id})`);

  // Check 3: Tab URL validity - more detailed checking
  if (currentTab.url?.startsWith('chrome://')) {
    issues.push('Cannot record on Chrome internal pages (chrome://)');
    return { issues, info };
  }
  if (currentTab.url?.startsWith('chrome-extension://')) {
    issues.push('Cannot record on Chrome extension pages');
    return { issues, info };
  }
  if (currentTab.url?.startsWith('moz-extension://')) {
    issues.push('Cannot record on Firefox extension pages');
    return { issues, info };
  }
  if (!currentTab.url || currentTab.url === 'about:blank') {
    issues.push('Tab has no URL or is blank page');
    return { issues, info };
  }
  info.push('✓ Tab URL is recordable');

  // Check 4: Tab loading status
  if (currentTab.status === 'loading') {
    issues.push('Tab is still loading - wait for page to complete loading');
    return { issues, info };
  }
  info.push('✓ Tab has finished loading');

  // Check 5: Content script injection
  try {
    recordLogger.debug('Checking content script injection for tab', {
      tabId: currentTab.id,
    });
    const isInjected = await checkContentScriptInjected(currentTab.id);
    if (isInjected) {
      info.push('✓ Content script is injected and responding');
    } else {
      issues.push('Content script not injected or not responding');

      // Try to inject
      try {
        recordLogger.debug('Attempting to inject content script');
        await injectScript(currentTab);
        info.push('✓ Content script injection attempted');

        // Check again after injection with longer wait
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        const isInjectedAfter = await checkContentScriptInjected(currentTab.id);
        if (isInjectedAfter) {
          info.push('✓ Content script injection successful');
        } else {
          issues.push(
            'Content script injection failed or not responding after injection. Try refreshing the page.',
          );
        }
      } catch (error: any) {
        const errorMsg = error?.message || error;
        if (errorMsg.includes('Cannot access')) {
          issues.push(
            'Cannot inject script: Page access denied (may be protected page)',
          );
        } else if (errorMsg.includes('chrome-extension://')) {
          issues.push('Cannot inject script on extension pages');
        } else {
          issues.push(`Content script injection failed: ${errorMsg}`);
        }
      }
    }
  } catch (error: any) {
    issues.push(`Error checking content script: ${error?.message || error}`);
  }

  recordLogger.info('Diagnosis complete');

  return { issues, info };
};
