import { AIActionType, callToGetJSONObject } from '@midscene/core/ai-model';
import { message } from 'antd';

import type { ChromeRecordedEvent } from '@midscene/record';
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
    return response?.success === true;
  } catch (error) {
    return false;
  }
};

// Re-inject script if needed
export const ensureScriptInjected = async (
  currentTab: chrome.tabs.Tab | null,
) => {
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
    message.error('Chrome extension environment required for script injection');
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
