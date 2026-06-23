import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  type MidsceneRecorderEvent,
  type MidsceneRecorderMarkdownScreenshotAsset,
  type MidsceneRecorderSemantic,
  type MidsceneRecorderTarget,
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';

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
  hashId: string;
  type: string;
  timestamp: number;
  source?: string;
  actionType?: string;
  url?: string;
  title?: string;
  semantic?: MidsceneRecorderSemantic;
  description?: string;
  value?: string;
  typedText?: string;
  inputIndex?: number;
  isSequentialInput?: boolean;
  hasNeighborInput?: boolean;
  previousInputDescription?: string;
  previousActionDescription?: string;
  nextActionDescription?: string;
  neighborInputValues?: string[];
  pageInfo?: any;
  elementRect?: any;
  screenshotPath?: string;
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

export interface RecorderGenerationContext {
  summary: EventSummary;
  screenshotAssets: MidsceneRecorderMarkdownScreenshotAsset[];
}

export type ChromeRecordedEvent = MidsceneRecorderEvent;

const MAX_RECORDER_GENERATION_SEMANTIC_TEXT_LENGTH = 1200;
const MAX_RECORDER_GENERATION_SEMANTIC_ERROR_LENGTH = 400;

export interface RecorderGenerationOptions {
  testName?: string;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
  /** Language for human-readable generated content (e.g. 'English', 'Chinese'). Keys and API names are kept as-is. */
  language?: string;
  navigationInfo?: {
    urls?: string[];
    titles?: string[];
    initialViewport?: {
      width?: number;
      height?: number;
    };
  };
}

export interface RecorderGenerationInput extends RecorderGenerationOptions {
  target: MidsceneRecorderTarget;
  events: MidsceneRecorderEvent[];
}

export interface FilteredEvents {
  navigationEvents: ChromeRecordedEvent[];
  clickEvents: ChromeRecordedEvent[];
  inputEvents: ChromeRecordedEvent[];
  scrollEvents: ChromeRecordedEvent[];
}

function cleanRecorderSemanticField(value?: string) {
  return value?.trim() === 'AI is analyzing element...' ? undefined : value;
}

function truncateRecorderGenerationText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function compactRecorderSemanticText(value?: string) {
  const cleaned = cleanRecorderSemanticField(value);
  return cleaned
    ? truncateRecorderGenerationText(
        cleaned,
        MAX_RECORDER_GENERATION_SEMANTIC_TEXT_LENGTH,
      )
    : undefined;
}

function compactRecorderSemanticError(value?: string) {
  return value
    ? truncateRecorderGenerationText(
        value,
        MAX_RECORDER_GENERATION_SEMANTIC_ERROR_LENGTH,
      )
    : undefined;
}

export function compactRecorderSemanticForGeneration(
  semantic?: MidsceneRecorderSemantic,
): MidsceneRecorderSemantic | undefined {
  if (!semantic) {
    return undefined;
  }

  return {
    source: semantic.source,
    status: semantic.status,
    confidence: semantic.confidence,
    elementDescription: compactRecorderSemanticText(
      semantic.elementDescription,
    ),
    replayInstruction: compactRecorderSemanticText(semantic.replayInstruction),
    actionSummary: compactRecorderSemanticText(semantic.actionSummary),
    error: compactRecorderSemanticError(semantic.error),
    ...(semantic.aiDescribe
      ? {
          aiDescribe: {
            verifyPrompt: semantic.aiDescribe.verifyPrompt,
            verifyPassed: semantic.aiDescribe.verifyPassed,
            deepLocate: semantic.aiDescribe.deepLocate,
            centerDistance: semantic.aiDescribe.centerDistance,
            expectedCenter: semantic.aiDescribe.expectedCenter,
            actualCenter: semantic.aiDescribe.actualCenter,
          },
        }
      : {}),
  };
}

export const validateEvents = (events: ChromeRecordedEvent[]): void => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }
};

export const getScreenshotsForLLM = (
  events: ChromeRecordedEvent[],
  maxScreenshots = 1,
): string[] => {
  return createMidsceneRecorderMarkdownScreenshotAssets(events, {
    baseDir: './screenshots',
    maxScreenshots,
  }).map((asset) => asset.dataUrl);
};

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

export const extractInputDescriptions = (
  inputEvents: ChromeRecordedEvent[],
): InputDescription[] => {
  return inputEvents
    .map((event) => {
      const semantic = getMidsceneRecorderSemantic(event);
      return {
        description:
          cleanRecorderSemanticField(semantic?.elementDescription) || '',
        value: event.value || '',
      };
    })
    .filter((item) => item.description && item.value);
};

export const processEventsForLLM = (
  events: ChromeRecordedEvent[],
  screenshotPathByEventHash: Map<string, string> = new Map(),
): ProcessedEvent[] => {
  let inputIndex = 0;
  return events.map((event, index) => {
    const previousEvent = events[index - 1];
    const nextEvent = events[index + 1];
    const previousInput = events
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.type === 'input');
    const nextInput = events
      .slice(index + 1)
      .find((candidate) => candidate.type === 'input');
    const isInput = event.type === 'input';
    const inputSequenceIndex = isInput ? ++inputIndex : undefined;
    const hasNeighborInput = Boolean(previousInput || nextInput);
    const neighborInputValues = isInput
      ? [previousInput?.value, nextInput?.value].filter(
          (value): value is string => Boolean(value),
        )
      : undefined;
    const semantic = compactRecorderSemanticForGeneration(
      getMidsceneRecorderSemantic(event),
    );

    return {
      hashId: event.hashId,
      type: event.type,
      timestamp: event.timestamp,
      source: event.source,
      actionType: event.actionType,
      url: event.url,
      title: event.title,
      semantic,
      description: getMidsceneRecorderEventDescription(event),
      value: event.value,
      previousActionDescription: previousEvent
        ? getMidsceneRecorderEventDescription(previousEvent)
        : undefined,
      nextActionDescription: nextEvent
        ? getMidsceneRecorderEventDescription(nextEvent)
        : undefined,
      ...(isInput
        ? {
            typedText: event.value || '',
            inputIndex: inputSequenceIndex,
            isSequentialInput:
              previousEvent?.type === 'input' || nextEvent?.type === 'input',
            hasNeighborInput,
            previousInputDescription: previousInput
              ? getMidsceneRecorderEventDescription(previousInput)
              : undefined,
            neighborInputValues:
              neighborInputValues && neighborInputValues.length > 0
                ? neighborInputValues
                : undefined,
          }
        : {}),
      pageInfo: event.pageInfo,
      elementRect: event.elementRect,
      screenshotPath: screenshotPathByEventHash.get(event.hashId),
    };
  });
};

export const prepareEventSummary = (
  events: ChromeRecordedEvent[],
  options: {
    testName?: string;
    maxScreenshots?: number;
    screenshotPathByEventHash?: Map<string, string>;
  } = {},
): EventSummary => {
  const filteredEvents = filterEventsByType(events);
  const eventCounts = createEventCounts(filteredEvents, events.length);

  const startUrl =
    filteredEvents.navigationEvents.length > 0
      ? filteredEvents.navigationEvents[0].url || ''
      : '';

  const clickDescriptions = filteredEvents.clickEvents
    .map((event) => getMidsceneRecorderSemantic(event)?.elementDescription)
    .filter((desc): desc is string => Boolean(desc))
    .slice(0, 10);

  const inputDescriptions = extractInputDescriptions(
    filteredEvents.inputEvents,
  ).slice(0, 10);

  const urls = filteredEvents.navigationEvents
    .map((e) => e.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);

  const processedEvents = processEventsForLLM(
    events,
    options.screenshotPathByEventHash,
  );

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

export function prepareRecorderGenerationContext(
  input: RecorderGenerationInput,
): RecorderGenerationContext {
  validateEvents(input.events);

  const maxScreenshots =
    input.maxScreenshots ?? DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS;
  const screenshotAssets = createMidsceneRecorderMarkdownScreenshotAssets(
    input.events,
    {
      baseDir: './screenshots',
      maxScreenshots,
    },
  );
  const screenshotPathByEventHash = new Map(
    screenshotAssets.map((asset) => [asset.eventHashId, asset.relativePath]),
  );

  return {
    summary: prepareEventSummary(input.events, {
      testName: input.testName,
      screenshotPathByEventHash,
    }),
    screenshotAssets,
  };
}

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
