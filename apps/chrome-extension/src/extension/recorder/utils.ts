import {
  type AIArgs,
  callAIWithObjectResponse,
  callAIWithStringResponse,
} from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import type { IModelConfig } from '@midscene/shared/env';
import { message } from 'antd';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { ChatCompletionContentPart } from 'openai/resources/index';
import type { RecordingSession } from '../../store';
import { recordLogger } from './logger';
import { isChromeExtension, safeChromeAPI } from './types';

// Generate default session name with current time
export const generateDefaultSessionName = () => {
  const now = new Date();
  const dateStr = now
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
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${dateStr}-${ms}`;
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
  const now = new Date();
  const dateStr = now
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
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${dateStr}-${ms}`;
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
  modelConfig: IModelConfig,
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
      const messageContent: ChatCompletionContentPart[] = [
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
      ] as const;

      const response = await callAIWithObjectResponse<{
        title: string;
        description: string;
      }>([prompt[0], prompt[1]], modelConfig);
      if (response?.content) {
        return {
          title: response.content.title as string,
          description: response.content.description as string,
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

// Generate AI-powered mindmap based on session events
const generateAIMindmap = async (
  sessions: RecordingSession[],
  modelConfig: IModelConfig,
): Promise<string> => {
  try {
    // Prepare detailed sequential event data for AI
    const sequentialSessionData = sessions.map((session) => {
      // Create a detailed sequential list of events with full descriptions
      const detailedEventSequence = session.events.map((event, index) => {
        const eventNumber = index + 1;
        let detailedDescription = '';
        let shortNodeName = '';

        switch (event.type) {
          case 'navigation':
            detailedDescription = `Navigate to "${event.title || 'Page'}" at URL: ${event.url}`;
            shortNodeName = `Navigate to ${(event.title || 'Page').slice(0, 15)}`;
            break;
          case 'click':
            detailedDescription = `Click on element "${event.elementDescription || 'element'}" on page "${event.title || event.url}"`;
            shortNodeName = `Click ${(event.elementDescription || 'Element').slice(0, 20)}`;
            break;
          case 'input':
            detailedDescription = `Input text "${event.value || ''}" into field "${event.elementDescription || 'field'}" on page "${event.title || event.url}"`;
            shortNodeName = `Input ${event.value ? `"${event.value.slice(0, 15)}"` : 'text'} in ${(event.elementDescription || 'field').slice(0, 15)}`;
            break;
          default:
            detailedDescription = `Perform ${event.type} action on "${event.elementDescription || 'element'}" on page "${event.title || event.url}"`;
            shortNodeName = `${event.type} ${(event.elementDescription || 'Element').slice(0, 15)}`;
        }

        return {
          sequenceNumber: eventNumber,
          eventType: event.type,
          detailedDescription,
          shortNodeName: shortNodeName.replace(/[^a-zA-Z0-9\s\-_"]/g, ''),
          pageName: event.title || event.url,
          timestamp: event.timestamp || new Date().toISOString(),
          // Additional context for AI
          elementDescription: event.elementDescription,
          inputValue: event.value,
          url: event.url,
          title: event.title,
        };
      });

      // Create page transition flow
      const pageFlow: {
        step: number;
        pageName: string;
        eventIndex: number;
      }[] = [];
      let currentPage = '';
      session.events.forEach((event, index) => {
        const pageName = event.title || event.url || 'Unknown Page';
        if (pageName !== currentPage) {
          pageFlow.push({
            step: pageFlow.length + 1,
            pageName,
            eventIndex: index + 1,
          });
          currentPage = pageName;
        }
      });

      return {
        sessionName: session.name,
        sessionDescription: session.description || '',
        totalEvents: session.events.length,
        createdAt: session.createdAt,
        // Sequential event data with full details
        eventSequence: detailedEventSequence,
        // Page transition flow
        pageTransitionFlow: pageFlow,
        // Summary statistics
        eventTypeCounts: {
          navigation: session.events.filter((e) => e.type === 'navigation')
            .length,
          clicks: session.events.filter((e) => e.type === 'click').length,
          inputs: session.events.filter((e) => e.type === 'input').length,
          other: session.events.filter(
            (e) => !['navigation', 'click', 'input'].includes(e.type),
          ).length,
        },
      };
    });

    const prompt: AIArgs = [
      {
        role: 'system',
        content: `You are an expert test automation analyst who creates detailed Mermaid mindmaps that preserve the complete sequence and details of user interactions.

    CRITICAL REQUIREMENTS:
    1. PRESERVE ALL EVENT DETAILS: Include complete descriptions from detailedDescription field
    2. MAINTAIN SEQUENTIAL ORDER: Events must follow the exact chronological sequence (1→2→3→4...)
    3. SHOW PROGRESSION: Each event should logically connect to the next event
    4. DETAILED NODE NAMES: Use full descriptive names, not abbreviated versions
    5. HIERARCHICAL FLOW: Organize by session → page transitions → detailed event sequence

    Mindmap Structure:
    - Root: Main test scenario
      \s- Level 1: Session name
      \s\s- Level 2: Page sections (when page changes)
      \s\s\s- Level 3: Sequential detailed events with full descriptions
      \s\s\s\s- Level 4: Sub-actions if needed

    Syntax Guidelines:
    - Use parentheses for root: root(Test Scenario)
    - Use descriptive text for events: Navigate to Login Page
    - Preserve sequence numbers: Step 1 Navigate to Homepage
    - Keep full element descriptions and input values
    - Show clear progression between events
    -

    IMPORTANT: Do not summarize or abbreviate event details. Include the full action descriptions to maintain test documentation value.`,
      },
      {
        role: 'user',
        content: `Create a detailed Mermaid mindmap that preserves ALL event details and maintains exact sequential order:

    ${JSON.stringify(sequentialSessionData, null, 2)}

    Requirements:
    1. Use the detailedDescription field for event nodes (preserve full descriptions)
    2. Maintain exact sequential order from eventSequence array
    3. Show page transitions clearly using pageTransitionFlow
    4. Include input values, element descriptions, and page contexts
    5. Create a hierarchical flow: Session → Page → Sequential Events
    6. Use meaningful, descriptive node names
    7. Ensure proper Mermaid mindmap syntax with correct indentation

    Example structure:
    mindmap
      root(User Journey Test)
        Session Name Here
          Homepage Section
            Step 1 Navigate to Homepage URL
            \s\s  Step 2 Click Login Button Element
            \s\s\s  Step 3 Input Username into Email Field
            \s\s\s\s  Login Page Section
            \s\s\s\s\s  Step 4 Navigate to Login Page
            \s\s\s\s\s\s  Step 5 Input Password into Password Field
            \s\s\s\s\s\s\s  Step 6 Click Submit Button Element

    Return ONLY the Mermaid mindmap syntax. Include ALL detailed descriptions and maintain sequential order.`,
      },
    ];

    const response = await callAIWithStringResponse(prompt, modelConfig);

    if (response?.content && typeof response.content === 'string') {
      return response.content as string;
    }

    // Fallback to enhanced sequential static mindmap if AI fails
    console.warn(
      'AI mindmap generation failed, using detailed sequential fallback',
    );
    return generateDetailedSequentialMindmap(sessions);
  } catch (error) {
    console.error('Error generating AI mindmap:', error);
    // Fallback to detailed sequential mindmap
    return generateDetailedSequentialMindmap(sessions);
  }
};

// Enhanced detailed sequential mindmap generation (preserves all event details and order)
const generateDetailedSequentialMindmap = (
  sessions: RecordingSession[],
): string => {
  let mermaid = 'mindmap\n  root(Detailed Test Execution Flow)\n';

  sessions.forEach((session, sessionIndex) => {
    if (session.events.length === 0) return;

    // Clean session name for use as node
    const sessionNodeName = session.name.replace(/[^a-zA-Z0-9\s]/g, '');
    mermaid += `    ${sessionNodeName}\n`;

    // Track page transitions for better organization
    let currentPage = '';
    let indentLevel = 2; // Start at level 2 (after session)

    session.events.forEach((event, eventIndex) => {
      const eventNumber = eventIndex + 1;
      const pageName = event.title || event.url || '';

      // Add page section when page changes and pageName is not empty
      if (pageName !== currentPage && pageName) {
        currentPage = pageName;
        const cleanPageName = pageName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .slice(0, 25);
        indentLevel++; // Increase indent level for events under this page
        const pageIndentation = '  '.repeat(indentLevel);
        mermaid += `${pageIndentation}${cleanPageName}\n`;
      }

      indentLevel++; // Increase indent level for events under this page
      // Generate detailed event description
      let detailedEventDescription = '';
      switch (event.type) {
        case 'navigation':
          detailedEventDescription = `Step ${eventNumber} Navigate to ${event.title || 'Page'}`;
          break;
        case 'click':
          detailedEventDescription = `Step ${eventNumber} Click ${event.elementDescription || 'element'}`;
          break;
        case 'input': {
          const inputValue = event.value
            ? ` "${event.value.slice(0, 20)}${event.value.length > 20 ? '...' : ''}"`
            : ' text';
          detailedEventDescription = `Step ${eventNumber} Input${inputValue} into ${event.elementDescription || 'field'}`;
          break;
        }
        default:
          detailedEventDescription = `Step ${eventNumber} ${event.type} on ${event.elementDescription || 'element'}`;
      }

      // Clean the description for Mermaid syntax
      const cleanDescription = detailedEventDescription.replace(
        /[^a-zA-Z0-9\s\-_"()]/g,
        '',
      );

      // Add event with current indent level using colon format
      const eventIndentation = '  '.repeat(indentLevel);
      mermaid += `${eventIndentation}${cleanDescription}\n`;
    });
  });

  return mermaid;
};

// Generate markdown table for event details
const generateEventsMarkdownTable = (sessions: RecordingSession[]): string => {
  let markdown = '# Test Events Report\n\n';

  sessions.forEach((session, sessionIndex) => {
    if (session.events.length === 0) return;

    markdown += `## ${session.name}\n\n`;
    if (session.description) {
      markdown += `**Description:** ${session.description}\n\n`;
    }
    markdown += `**Created:** ${new Date(session.createdAt).toLocaleString()}\n\n`;

    markdown += '| Page | Screenshot Before | Screenshot After | Action |\n';
    markdown += '|------|------------|------------|--------|\n';

    session.events.forEach((event, eventIndex) => {
      let expected = 'N/A';
      const page = event.title || event.url || '';
      const screenshotBefore = event.screenshotBefore
        ? `![](./images/screenshot_${sessionIndex}_${eventIndex}_before.png)`
        : 'N/A';
      const screenshotAfter = event.screenshotAfter
        ? `![](./images/screenshot_${sessionIndex}_${eventIndex}_after.png)`
        : 'N/A';
      if (event.type === 'navigation') {
        expected = `Navigate to ${event.url}`;
      }

      let action = '';
      switch (event.type) {
        case 'click':
          action = `Click on ${event.elementDescription || 'element'}`;
          break;
        case 'input':
          action = `Input "${event.value}" into ${event.elementDescription || 'field'}`;
          break;
        case 'navigation':
          action = `Navigate to ${event.url}`;
          break;
        default:
          action = `${event.type} on ${event.elementDescription || 'element'}`;
      }

      markdown += `| ${page} | ${screenshotBefore} | ${screenshotAfter} | ${action} |\n`;
    });

    if (session.generatedCode?.yaml || session.generatedCode?.playwright) {
      markdown += '## Generated Code\n\n';
      if (session.generatedCode?.yaml) {
        markdown += '### YAML\n\n';
        markdown += `\`\`\`yaml\n${session.generatedCode.yaml}\n\`\`\`\n\n`;
      }
      if (session.generatedCode?.playwright) {
        markdown += '### Playwright\n\n';
        markdown += `\`\`\`playwright\n${session.generatedCode.playwright}\n\`\`\`\n\n`;
      }
    }

    markdown += '\n\n\n';
  });

  return markdown;
};

// Convert base64 to blob
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

// Export all sessions with events to ZIP file
export const exportAllEventsToZip = async (sessions: RecordingSession[]) => {
  try {
    const zip = new JSZip();

    // Filter sessions that have events
    const sessionsWithEvents = sessions.filter(
      (session) => session.events.length > 0,
    );

    if (sessionsWithEvents.length === 0) {
      message.warning('No sessions with events to export');
      return;
    }

    // Add images folder
    const imagesFolder = zip.folder('images');

    // Process each session and extract images
    sessionsWithEvents.forEach((session, sessionIndex) => {
      session.events.forEach((event, eventIndex) => {
        const ext = 'png';
        if (event.screenshotBefore) {
          const fileName = `screenshot_${sessionIndex}_${eventIndex}_before.${ext}`;
          const blob = base64ToBlob(event.screenshotBefore, `image/${ext}`);
          imagesFolder?.file(fileName, blob);
        }
        if (event.screenshotAfter) {
          const fileName = `screenshot_${sessionIndex}_${eventIndex}_after.${ext}`;
          const blob = base64ToBlob(event.screenshotAfter, `image/${ext}`);
          imagesFolder?.file(fileName, blob);
        }
      });
    });

    // Generate and add markdown table
    const markdownContent = generateEventsMarkdownTable(sessionsWithEvents);

    // Generate AI-powered mindmap
    const aiMindmap =
      await generateDetailedSequentialMindmap(sessionsWithEvents);

    // Combine mindmap and table in automation-story.md
    const combinedContent = `# Test Events Report

## Test Flow Mindmap

\`\`\`mermaid
${aiMindmap}
\`\`\`

${markdownContent.replace('# Test Events Report\n\n', '')}`;

    zip.file('automation-story.md', combinedContent);

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Download ZIP file
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    saveAs(zipBlob, `midscene-test-events-${timestamp}.zip`);

    message.success('All events exported successfully!');
  } catch (error) {
    console.error('Error exporting all events:', error);
    message.error('Failed to export events');
  }
};
