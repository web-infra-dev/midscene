import { message } from 'antd';
import { callToGetJSONObject } from '@midscene/core/ai-model';

// Import AIActionType enum locally since it's not exported from the module
enum AIActionType {
  ASSERT = 0,
  INSPECT_ELEMENT = 1,
  EXTRACT_DATA = 2,
  PLAN = 3,
  DESCRIBE_ELEMENT = 4,
}
import { type RecordedEvent } from '../../store';
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
  events: RecordedEvent[],
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

// Generate a title and description for recording using AI based on events
export const generateRecordTitle = async (
  events: RecordedEvent[],
): Promise<{
  title?: string;
  description?: string;
}> => {
  try {
    // Only proceed if we have events
    if (!events.length) {
      return {};
    }

    // If there's very little data, use the simple method
    if (events.length < 5) {
      return generateSimpleRecordTitle(events);
    }

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
      // Use LLM to generate title and description
      const prompt = [
        {
          role: 'system',
          content:
            'You are an AI that generates concise, descriptive titles and descriptions for browser recording sessions. Your goal is to capture the essence of what the user accomplished in a clear, task-oriented way.',
        },
        {
          role: 'user',
          content: `Generate a concise title (5-7 words) and brief description (1-2 sentences) for a browser recording session with the following events:

${JSON.stringify(summary, null, 2)}

Respond with a JSON object containing "title" and "description" fields. The title should be action-oriented and highlight the main task accomplished. The description should provide slightly more detail about what was done.`,
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
      // Fall back to simple title generation
      return generateSimpleRecordTitle(events);
    }

    // If LLM fails, fall back to simple method
    return generateSimpleRecordTitle(events);
  } catch (error) {
    console.error('Error generating recording title:', error);
    return {};
  }
};

// Fallback method to generate a simple title and description without LLM
const generateSimpleRecordTitle = (
  events: RecordedEvent[],
): {
  title?: string;
  description?: string;
} => {
  // Collect useful event information to summarize
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

  // If there's very little data, we can't generate a good title
  if (
    clickEvents.length < 2 &&
    inputEvents.length < 2 &&
    navigationEvents.length < 2
  ) {
    return {};
  }

  // Generate a title from the summary
  let title = '';

  // Try to use the first page title if it exists
  if (pageTitles.length > 0 && pageTitles[0]) {
    // Extract domain from URL for context
    const domain = urls[0] ? new URL(urls[0]).hostname.replace('www.', '') : '';

    if (clickEvents.length > 0 || inputEvents.length > 0) {
      // Create a task-based title
      const action =
        inputEvents.length > clickEvents.length
          ? 'Form Filling on'
          : 'Navigation on';
      title = `${action} ${domain || pageTitles[0]}`;
    } else {
      // Just use the page title
      title = `Visit to ${domain || pageTitles[0]}`;
    }
  } else {
    // Fallback if no page title
    const actionCount = clickEvents.length + inputEvents.length;
    title = `Recording with ${actionCount} actions`;
  }

  // Generate a brief description
  let description = '';
  if (navigationEvents.length > 1) {
    description = `Visited ${navigationEvents.length} pages`;
  } else if (navigationEvents.length === 1) {
    description = `Visited ${pageTitles[0] || 'a page'}`;
  }

  if (clickEvents.length > 0 || inputEvents.length > 0) {
    description += description ? ', ' : '';
    description += `performed ${clickEvents.length} clicks and ${inputEvents.length} inputs`;
  }

  if (clickDescriptions.length > 0) {
    description += `. Example actions: ${clickDescriptions[0]}`;
  }

  return { title, description };
};
