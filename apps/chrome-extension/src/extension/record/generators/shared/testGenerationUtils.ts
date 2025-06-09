import type { ChromeRecordedEvent } from '@midscene/record';
import { recordLogger } from '../../logger';
import type {
  EventCounts,
  EventSummary,
  FilteredEvents,
  InputDescription,
  ProcessedEvent,
  TestGenerationOptions,
} from './types';

/**
 * Get screenshots from events for LLM context
 * Centralized implementation to replace duplicated functions
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
  options: TestGenerationOptions = {},
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
): Array<string | Record<string, any>> => {
  const messageContent: Array<string | Record<string, any>> = [
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
 * Handle test generation errors with consistent logging
 */
export const handleTestGenerationError = (
  error: any,
  context: string,
  eventsCount?: number,
): Error => {
  recordLogger.error(`Error generating ${context}`, { eventsCount }, error);
  return new Error(`Failed to generate ${context}: ${error}`);
};

/**
 * Validate events before processing
 */
export const validateEvents = (events: ChromeRecordedEvent[]): void => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }
};
