import type {
  StreamingAIResponse,
  StreamingCodeGenerationOptions,
} from '@/types';
import { YAML_EXAMPLE_CODE } from '@midscene/shared/constants';
import type { IModelConfig } from '@midscene/shared/env';
import {
  type ChatCompletionMessageParam,
  callAI,
  callAIWithStringResponse,
} from '../index';

// Common interfaces for test generation (shared between YAML and Playwright)
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
  urls: string[];
  clickDescriptions: string[];
  inputDescriptions: InputDescription[];
  events: ProcessedEvent[];
}

// Common ChromeRecordedEvent interface
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

export interface YamlGenerationOptions {
  testName?: string;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
}

export interface FilteredEvents {
  navigationEvents: ChromeRecordedEvent[];
  clickEvents: ChromeRecordedEvent[];
  inputEvents: ChromeRecordedEvent[];
  scrollEvents: ChromeRecordedEvent[];
}

// Common utility functions (shared between YAML and Playwright generators)

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
export const filterEventsByType = (
  events: ChromeRecordedEvent[],
): FilteredEvents => {
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
  filteredEvents: FilteredEvents,
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
  options: { testName?: string; maxScreenshots?: number } = {},
): EventSummary => {
  const filteredEvents = filterEventsByType(events);
  const eventCounts = createEventCounts(filteredEvents, events.length);

  // Extract useful information from events
  const startUrl =
    filteredEvents.navigationEvents.length > 0
      ? filteredEvents.navigationEvents[0].url || ''
      : '';

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
 * Validate events before processing
 */
export const validateEvents = (events: ChromeRecordedEvent[]): void => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }
};

// YAML-specific generation functions

/**
 * Generates YAML test configuration from recorded events using AI
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions,
  modelConfig: IModelConfig,
): Promise<string> => {
  try {
    // Validate input
    validateEvents(events);

    // Prepare event summary using shared utilities
    const summary = prepareEventSummary(events, {
      testName: options.testName,
      maxScreenshots: options.maxScreenshots || 3,
    });

    // Add YAML-specific options to summary
    const yamlSummary = {
      ...summary,
      includeTimestamps: options.includeTimestamps || false,
    };

    // Get screenshots for visual context
    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 3,
    );

    // Use LLM to generate the YAML test configuration
    const prompt: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following these rules: ${YAML_EXAMPLE_CODE}`,
      },
      {
        role: 'user',
        content: `Generate YAML test for Midscene.js automation from recorded browser events.

Event Summary:
${JSON.stringify(yamlSummary, null, 2)}

Convert events:
- navigation → target.url
- click → aiTap with element description
- input → aiInput with value and locate
- scroll → aiScroll with appropriate direction
- Add aiAssert for important state changes

Important: Return ONLY the raw YAML content. Do NOT wrap the response in markdown code blocks (no \`\`\`yaml or \`\`\`). Start directly with the YAML content.`,
      },
    ];

    // Add screenshots if available and requested
    if (screenshots.length > 0) {
      prompt.push({
        role: 'user',
        content:
          'Here are screenshots from the recording session to help you understand the context:',
      });

      prompt.push({
        role: 'user',
        content: screenshots.map((screenshot) => ({
          type: 'image_url',
          image_url: {
            url: screenshot,
          },
        })),
      });
    }

    const response = await callAIWithStringResponse(prompt, modelConfig);

    if (response?.content && typeof response.content === 'string') {
      return response.content;
    }

    throw new Error('Failed to generate YAML test configuration');
  } catch (error) {
    throw new Error(`Failed to generate YAML test: ${error}`);
  }
};

/**
 * Generates YAML test configuration from recorded events using AI with streaming support
 */
export const generateYamlTestStream = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions & StreamingCodeGenerationOptions,
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  try {
    // Validate input
    validateEvents(events);

    // Prepare event summary using shared utilities
    const summary = prepareEventSummary(events, {
      testName: options.testName,
      maxScreenshots: options.maxScreenshots || 3,
    });

    // Add YAML-specific options to summary
    const yamlSummary = {
      ...summary,
      includeTimestamps: options.includeTimestamps || false,
    };

    // Get screenshots for visual context
    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 3,
    );

    // Use LLM to generate the YAML test configuration
    const prompt: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following these rules: ${YAML_EXAMPLE_CODE}`,
      },
      {
        role: 'user',
        content: `Generate YAML test for Midscene.js automation from recorded browser events.

Event Summary:
${JSON.stringify(yamlSummary, null, 2)}

Convert events:
- navigation → target.url
- click → aiTap with element description
- input → aiInput with value and locate
- scroll → aiScroll with appropriate direction
- Add aiAssert for important state changes

Important: Return ONLY the raw YAML content. Do NOT wrap the response in markdown code blocks (no \`\`\`yaml or \`\`\`). Start directly with the YAML content.`,
      },
    ];

    // Add screenshots if available and requested
    if (screenshots.length > 0) {
      prompt.push({
        role: 'user',
        content:
          'Here are screenshots from the recording session to help you understand the context:',
      });

      prompt.push({
        role: 'user',
        content: screenshots.map((screenshot) => ({
          type: 'image_url',
          image_url: {
            url: screenshot,
          },
        })),
      });
    }

    if (options.stream && options.onChunk) {
      // Use streaming
      return await callAI(prompt, modelConfig, {
        stream: true,
        onChunk: options.onChunk,
      });
    } else {
      // Fallback to non-streaming
      const response = await callAIWithStringResponse(prompt, modelConfig);

      if (response?.content && typeof response.content === 'string') {
        return {
          content: response.content,
          usage: response.usage,
          isStreamed: false,
        };
      }

      throw new Error('Failed to generate YAML test configuration');
    }
  } catch (error) {
    throw new Error(`Failed to generate YAML test: ${error}`);
  }
};
