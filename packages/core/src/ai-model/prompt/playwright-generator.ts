import { PLAYWRIGHT_EXAMPLE_CODE } from '@midscene/shared/constants';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType, callAi, callStream } from '../index';
import type { StreamingCodeGenerationOptions, StreamingAIResponse } from '@/types';

// Types and interfaces for Playwright test generation
export interface EventCounts {
  navigation: number;
  click: number;
  input: number;
  scroll: number;
  total: number;
}

export interface InputDescription {
  description: string;
  value: string;
}

export interface ProcessedEvent {
  type: string;
  timestamp: number;
  url?: string;
  title?: string;
  elementDescription?: string;
  value?: string;
  pageInfo?: any;
  elementRect?: any;
}

export interface EventSummary {
  testName: string;
  startUrl: string;
  eventCounts: EventCounts;
  pageTitles: string[];
  urls: string[];
  clickDescriptions: string[];
  inputDescriptions: InputDescription[];
  events: ProcessedEvent[];
}

export interface PlaywrightGenerationOptions {
  testName?: string;
  includeScreenshots?: boolean;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
  viewportSize?: { width: number; height: number };
  waitForNetworkIdle?: boolean;
  waitForNetworkIdleTimeout?: number;
}

export interface ChromeRecordedEvent {
  type: string;
  timestamp: number;
  url?: string;
  title?: string;
  elementDescription?: string;
  value?: string;
  pageInfo?: any;
  elementRect?: any;
  screenshotBefore?: string;
  screenshotAfter?: string;
  screenshotWithBox?: string;
}

/**
 * Get screenshots from events for LLM context
 */
export const getScreenshotsForLLM = (
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

/**
 * Filter events by type for easier processing
 */
export const filterEventsByType = (events: ChromeRecordedEvent[]) => {
  return {
    navigationEvents: events.filter((event) => event.type === 'navigation'),
    clickEvents: events.filter((event) => event.type === 'click'),
    inputEvents: events.filter((event) => event.type === 'input'),
    scrollEvents: events.filter((event) => event.type === 'scroll'),
  };
};

/**
 * Create event counts summary
 */
export const createEventCounts = (
  filteredEvents: ReturnType<typeof filterEventsByType>,
  totalEvents: number,
): EventCounts => {
  return {
    navigation: filteredEvents.navigationEvents.length,
    click: filteredEvents.clickEvents.length,
    input: filteredEvents.inputEvents.length,
    scroll: filteredEvents.scrollEvents.length,
    total: totalEvents,
  };
};

/**
 * Extract input descriptions from input events
 */
export const extractInputDescriptions = (
  inputEvents: ChromeRecordedEvent[],
): InputDescription[] => {
  return inputEvents
    .map((event) => ({
      description: event.elementDescription || '',
      value: event.value || '',
    }))
    .filter((item) => item.description && item.value);
};

/**
 * Process events for LLM consumption
 */
export const processEventsForLLM = (
  events: ChromeRecordedEvent[],
): ProcessedEvent[] => {
  return events.map((event) => ({
    type: event.type,
    timestamp: event.timestamp,
    url: event.url,
    title: event.title,
    elementDescription: event.elementDescription,
    value: event.value,
    pageInfo: event.pageInfo,
    elementRect: event.elementRect,
  }));
};

/**
 * Prepare comprehensive event summary for LLM
 */
export const prepareEventSummary = (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions = {},
): EventSummary => {
  const filteredEvents = filterEventsByType(events);
  const eventCounts = createEventCounts(filteredEvents, events.length);

  // Extract useful information from events
  const startUrl =
    filteredEvents.navigationEvents.length > 0
      ? filteredEvents.navigationEvents[0].url || ''
      : '';

  const pageTitles = filteredEvents.navigationEvents
    .map((event) => event.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, 5);

  const clickDescriptions = filteredEvents.clickEvents
    .map((event) => event.elementDescription)
    .filter((desc): desc is string => Boolean(desc))
    .slice(0, 10);

  const inputDescriptions = extractInputDescriptions(
    filteredEvents.inputEvents,
  ).slice(0, 10);

  const urls = filteredEvents.navigationEvents
    .map((e) => e.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);

  const processedEvents = processEventsForLLM(events);

  return {
    testName: options.testName || 'Automated test from recorded events',
    startUrl,
    eventCounts,
    pageTitles,
    urls,
    clickDescriptions,
    inputDescriptions,
    events: processedEvents,
  };
};

/**
 * Create message content for LLM with optional screenshots
 */
export const createMessageContent = (
  promptText: string,
  screenshots: string[] = [],
  includeScreenshots = true,
) => {
  const messageContent: any[] = [
    {
      type: 'text',
      text: promptText,
    },
  ];

  // Add screenshots if available and requested
  if (includeScreenshots && screenshots.length > 0) {
    messageContent.unshift({
      type: 'text',
      text: 'Here are screenshots from the recording session to help you understand the context:',
    });

    screenshots.forEach((screenshot) => {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: screenshot,
        },
      });
    });
  }

  return messageContent;
};

/**
 * Validates events before processing
 */
export const validateEvents = (events: ChromeRecordedEvent[]): void => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }
};

/**
 * Generates Playwright test code from recorded events
 */
export const generatePlaywrightTest = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions = {},
): Promise<string> => {
  // Validate input
  validateEvents(events);

  // Prepare event summary using shared utilities
  const summary = prepareEventSummary(events, {
    testName: options.testName,
    maxScreenshots: options.maxScreenshots || 3,
  });

  // Add Playwright-specific options to summary
  const playwrightSummary = {
    ...summary,
    waitForNetworkIdle: options.waitForNetworkIdle !== false,
    waitForNetworkIdleTimeout: options.waitForNetworkIdleTimeout || 2000,
    viewportSize: options.viewportSize || { width: 1280, height: 800 },
  };

  // Get screenshots for visual context
  const screenshots = getScreenshotsForLLM(events, options.maxScreenshots || 3);

  // Create prompt text
  const promptText = `Generate a Playwright test using @midscene/web/playwright that reproduces this recorded browser session. The test should be based on the following events and follow the structure of the example provided. Make the test descriptive with appropriate assertions and validations.

Event Summary:
${JSON.stringify(playwrightSummary, null, 2)}

Generated code should:
1. Import required dependencies
2. Set up the test with proper configuration
3. Include a beforeEach hook to navigate to the starting URL
4. Implement a test that uses Midscene AI methods (aiTap, aiInput, aiAssert, etc.)
5. Include appropriate assertions and validations
6. Follow best practices for Playwright tests
7. Be ready to execute without further modification

Respond ONLY with the complete Playwright test code, no explanations.`;

  // Create message content with screenshots
  const messageContent = createMessageContent(
    promptText,
    screenshots,
    options.includeScreenshots !== false,
  );

  // Create system prompt
  const systemPrompt = `You are an expert test automation engineer specializing in Playwright and Midscene. 
Your task is to generate a complete, executable Playwright test using @midscene/web/playwright that reproduces a recorded browser session.

${PLAYWRIGHT_EXAMPLE_CODE}`;

  // Use LLM to generate the Playwright test code
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: messageContent,
    },
  ];

  const response = await callAi(prompt, AIActionType.EXTRACT_DATA);

  if (response?.content && typeof response.content === 'string') {
    return response.content;
  }

  throw new Error('Failed to generate Playwright test code');
};

/**
 * Generates Playwright test code from recorded events with streaming support
 */
export const generatePlaywrightTestStream = async (
  events: ChromeRecordedEvent[],
  options: PlaywrightGenerationOptions & StreamingCodeGenerationOptions = {},
): Promise<StreamingAIResponse> => {
  // Validate input
  validateEvents(events);

  // Prepare event summary using shared utilities
  const summary = prepareEventSummary(events, {
    testName: options.testName,
    maxScreenshots: options.maxScreenshots || 3,
  });

  // Add Playwright-specific options to summary
  const playwrightSummary = {
    ...summary,
    waitForNetworkIdle: options.waitForNetworkIdle !== false,
    waitForNetworkIdleTimeout: options.waitForNetworkIdleTimeout || 2000,
    viewportSize: options.viewportSize || { width: 1280, height: 800 },
  };

  // Get screenshots for visual context
  const screenshots = getScreenshotsForLLM(events, options.maxScreenshots || 3);

  // Create prompt text
  const promptText = `Generate a Playwright test using @midscene/web/playwright that reproduces this recorded browser session. The test should be based on the following events and follow the structure of the example provided. Make the test descriptive with appropriate assertions and validations.

Event Summary:
${JSON.stringify(playwrightSummary, null, 2)}

Generated code should:
1. Import required dependencies
2. Set up the test with proper configuration
3. Include a beforeEach hook to navigate to the starting URL
4. Implement a test that uses Midscene AI methods (aiTap, aiInput, aiAssert, etc.)
5. Include appropriate assertions and validations
6. Follow best practices for Playwright tests
7. Be ready to execute without further modification

Respond ONLY with the complete Playwright test code, no explanations.`;

  // Create message content with screenshots
  const messageContent = createMessageContent(
    promptText,
    screenshots,
    options.includeScreenshots !== false,
  );

  // Create system prompt
  const systemPrompt = `You are an expert test automation engineer specializing in Playwright and Midscene. 
Your task is to generate a complete, executable Playwright test using @midscene/web/playwright that reproduces a recorded browser session.

${PLAYWRIGHT_EXAMPLE_CODE}`;

  // Use LLM to generate the Playwright test code with streaming
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: messageContent,
    },
  ];

  if (options.stream && options.onChunk) {
    // Use streaming
    return await callStream(prompt, AIActionType.EXTRACT_DATA, options.onChunk);
  } else {
    // Fallback to non-streaming
    const response = await callAi(prompt, AIActionType.EXTRACT_DATA);
    
    if (response?.content && typeof response.content === 'string') {
      return {
        content: response.content,
        usage: response.usage,
        isStreamed: false,
      };
    }

    throw new Error('Failed to generate Playwright test code');
  }
};
