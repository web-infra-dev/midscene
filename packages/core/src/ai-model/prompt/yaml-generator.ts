import type {
  StreamingAIResponse,
  StreamingCodeGenerationOptions,
} from '@/types';
import { YAML_EXAMPLE_CODE } from '@midscene/shared/constants';
import type { IModelConfig } from '@midscene/shared/env';
import {
  type MidsceneRecorderEvent,
  type MidsceneRecorderTarget,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
  stringifyMidsceneRecorderTargetBlock,
} from '@midscene/shared/recorder';
import {
  type ChatCompletionMessageParam,
  callAI,
  callAIWithStringResponse,
} from '../index';
import { type ModelRuntime, getModelRuntime } from '../models';

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
  source?: string;
  actionType?: string;
  url?: string;
  title?: string;
  elementDescription?: string;
  description?: string;
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

export type ChromeRecordedEvent = MidsceneRecorderEvent;

export interface YamlGenerationOptions {
  testName?: string;
  includeTimestamps?: boolean;
  maxScreenshots?: number;
  description?: string;
  /** Language for human-readable YAML content (e.g. 'English', 'Chinese'). Keys and API names are kept as-is. */
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

export interface RecorderYamlGenerationInput extends YamlGenerationOptions {
  target: MidsceneRecorderTarget;
  events: MidsceneRecorderEvent[];
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
  return getMidsceneRecorderScreenshotsForLLM(events, maxScreenshots);
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
    source: event.source,
    actionType: event.actionType,
    url: event.url,
    title: event.title,
    elementDescription: event.elementDescription,
    description: getMidsceneRecorderEventDescription(event),
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

const getYamlLanguageInstruction = (language?: string) => {
  const normalizedLanguage = language?.trim();
  if (!normalizedLanguage) {
    return '';
  }

  return `
Language requirement:
- Write all human-readable YAML content in ${normalizedLanguage}.
- Keep YAML keys, field names, and Midscene API names unchanged.`;
};

const createYamlPrompt = ({
  yamlSummary,
  screenshots,
  language,
  targetBlock,
  target,
}: {
  yamlSummary: EventSummary & { includeTimestamps: boolean };
  screenshots: string[];
  language?: string;
  targetBlock: string;
  target: MidsceneRecorderTarget;
}): ChatCompletionMessageParam[] => {
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are an expert in Midscene.js YAML test generation. Generate clean, accurate YAML following these rules: ${YAML_EXAMPLE_CODE}`,
    },
    {
      role: 'user',
      content: `Generate YAML test for Midscene.js automation from recorded events.

Target platform:
- Preserve this exact top-level target platform: ${target.platformId}
- Use exactly one top-level target block.
- The target block must be:
${targetBlock}

Event Summary:
${JSON.stringify(yamlSummary, null, 2)}

Convert events:
- navigation → target URL or aiAction only when the target platform supports it
- click → aiTap with element description
- input → aiInput with value and locate
- scroll → aiScroll with appropriate direction
- keydown → aiKeyboardPress
- Add aiAssert for important state changes${getYamlLanguageInstruction(language)}

Important: Return ONLY the raw YAML content. Do NOT wrap the response in markdown code blocks (no \`\`\`yaml or \`\`\`). Start directly with the YAML content.`,
    },
  ];

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

  return prompt;
};

/**
 * Validate events before processing
 */
export const validateEvents = (events: ChromeRecordedEvent[]): void => {
  if (!events.length) {
    throw new Error('No events provided for test generation');
  }
};

function createDefaultWebTarget(
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions,
): MidsceneRecorderTarget {
  const navigationEvents = events.filter(
    (event) => event.type === 'navigation',
  );
  const firstUrl =
    options.navigationInfo?.urls?.find(Boolean) ||
    navigationEvents.find((event) => event.url)?.url ||
    '';
  const firstViewport =
    options.navigationInfo?.initialViewport ||
    events.find((event) => event.pageInfo)?.pageInfo;

  return {
    platformId: 'web',
    deviceId: firstUrl || undefined,
    label: firstUrl || 'Web',
    values: {
      url: firstUrl,
      ...(firstViewport?.width ? { viewportWidth: firstViewport.width } : {}),
      ...(firstViewport?.height
        ? { viewportHeight: firstViewport.height }
        : {}),
    },
  };
}

function normalizeGeneratedYaml(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:ya?ml)?\s*([\s\S]*?)\s*```$/i);
  return `${(fencedMatch?.[1] ?? trimmed).trim()}\n`;
}

function resolveModelRuntime(model: IModelConfig | ModelRuntime): ModelRuntime {
  if ('config' in model && 'adapter' in model) {
    return model;
  }
  return getModelRuntime(model);
}

function createRecorderYamlPrompt(
  input: RecorderYamlGenerationInput,
): ChatCompletionMessageParam[] {
  validateEvents(input.events);

  const summary = prepareEventSummary(input.events, {
    testName: input.testName,
    maxScreenshots: input.maxScreenshots || 3,
  });
  const yamlSummary = {
    ...summary,
    target: input.target,
    includeTimestamps: input.includeTimestamps || false,
  };
  const screenshots = getScreenshotsForLLM(
    input.events,
    input.maxScreenshots || 3,
  );

  return createYamlPrompt({
    yamlSummary,
    screenshots,
    language: input.language,
    target: input.target,
    targetBlock: stringifyMidsceneRecorderTargetBlock(input.target),
  });
}

export const generateRecorderYamlTest = async (
  input: RecorderYamlGenerationInput,
  model: IModelConfig | ModelRuntime,
): Promise<string> => {
  try {
    const prompt = createRecorderYamlPrompt(input);
    const response = await callAIWithStringResponse(
      prompt,
      resolveModelRuntime(model),
    );

    if (response?.content && typeof response.content === 'string') {
      return normalizeGeneratedYaml(response.content);
    }

    throw new Error('Failed to generate recorder YAML test configuration');
  } catch (error) {
    throw new Error(`Failed to generate recorder YAML test: ${error}`);
  }
};

export const generateRecorderYamlTestStream = async (
  input: RecorderYamlGenerationInput,
  options: StreamingCodeGenerationOptions,
  model: IModelConfig | ModelRuntime,
): Promise<StreamingAIResponse> => {
  try {
    const prompt = createRecorderYamlPrompt(input);
    const modelRuntime = resolveModelRuntime(model);
    if (options.stream && options.onChunk) {
      return await callAI(prompt, modelRuntime, {
        stream: true,
        onChunk: options.onChunk,
      });
    }

    const response = await callAIWithStringResponse(prompt, modelRuntime);
    if (response?.content && typeof response.content === 'string') {
      return {
        content: normalizeGeneratedYaml(response.content),
        usage: response.usage,
        isStreamed: false,
      };
    }

    throw new Error('Failed to generate recorder YAML test configuration');
  } catch (error) {
    throw new Error(`Failed to generate recorder YAML test: ${error}`);
  }
};

// YAML-specific generation functions

/**
 * Generates YAML test configuration from recorded events using AI
 */
export const generateYamlTest = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions,
  model: IModelConfig | ModelRuntime,
): Promise<string> => {
  return generateRecorderYamlTest(
    {
      ...options,
      target: createDefaultWebTarget(events, options),
      events,
    },
    model,
  );
};

/**
 * Generates YAML test configuration from recorded events using AI with streaming support
 */
export const generateYamlTestStream = async (
  events: ChromeRecordedEvent[],
  options: YamlGenerationOptions & StreamingCodeGenerationOptions,
  model: IModelConfig | ModelRuntime,
): Promise<StreamingAIResponse> => {
  return generateRecorderYamlTestStream(
    {
      ...options,
      target: createDefaultWebTarget(events, options),
      events,
    },
    options,
    model,
  );
};
