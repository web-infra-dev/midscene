import type { IModelConfig } from '@midscene/shared/env';
import {
  type MidsceneRecorderEvent,
  type MidsceneRecorderTarget,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';
import { getModelRuntime } from '../../models';
import { callAIWithObjectResponse } from '../../service-caller';
import {
  compactRecorderSemanticForGeneration,
  prepareRecorderModelInputImages,
  resolveRecorderModelInputImageOptions,
} from './common';

export interface RecorderMetadataGenerationInput {
  target: MidsceneRecorderTarget;
  events: MidsceneRecorderEvent[];
  fallbackName?: string;
  maxScreenshots?: number;
}

export interface RecorderGeneratedMetadata {
  title?: string;
  description?: string;
}

const RECORDER_METADATA_MAX_EVENT_SAMPLES = 20;

function selectRecorderMetadataEventIndexes(
  eventCount: number,
  maxEvents = RECORDER_METADATA_MAX_EVENT_SAMPLES,
) {
  if (eventCount <= maxEvents) {
    return Array.from({ length: eventCount }, (_, index) => index);
  }
  return Array.from({ length: maxEvents }, (_, index) =>
    Math.round((index * (eventCount - 1)) / (maxEvents - 1)),
  );
}

function summarizeRecorderEvents(input: RecorderMetadataGenerationInput) {
  const events = input.events;
  const navigationEvents = events.filter(
    (event) => event.type === 'navigation',
  );
  const clickEvents = events.filter((event) => event.type === 'click');
  const inputEvents = events.filter((event) => event.type === 'input');
  const scrollEvents = events.filter((event) => event.type === 'scroll');
  const urls = navigationEvents
    .map((event) => event.url)
    .filter((url): url is string => Boolean(url));
  const titles = navigationEvents
    .map((event) => event.title)
    .filter((title): title is string => Boolean(title));
  const userActionEvents = events.filter(
    (event) =>
      !event.parentEventId &&
      event.type !== 'navigation' &&
      event.type !== 'setViewport',
  );
  const actionSequences = userActionEvents
    .map((event) => event.sequence)
    .filter(
      (sequence): sequence is number =>
        typeof sequence === 'number' && Number.isFinite(sequence),
    );
  const selectedEventIndexes = selectRecorderMetadataEventIndexes(
    events.length,
  );
  const eventTypeCounts = events.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    },
    {},
  );
  const summarizeEvent = (
    event: MidsceneRecorderEvent,
    eventIndex: number,
  ) => ({
    eventIndex: eventIndex + 1,
    type: event.type,
    actionType: event.actionType,
    sequence: event.sequence,
    url: event.url,
    title: event.title,
    value: event.value,
    description: getMidsceneRecorderEventDescription(event),
    semantic: compactRecorderSemanticForGeneration(
      getMidsceneRecorderSemantic(event),
    ),
  });

  return {
    platform: input.target.platformId,
    target: input.target,
    fallbackName: input.fallbackName,
    pageCount: navigationEvents.length,
    pageTitles: titles.slice(0, 5),
    urls: urls.slice(0, 5),
    clickCount: clickEvents.length,
    inputCount: inputEvents.length,
    scrollCount: scrollEvents.length,
    totalEvents: events.length,
    userActionCount: userActionEvents.length,
    eventTypeCounts,
    actionSequence:
      actionSequences.length > 0
        ? {
            first: Math.min(...actionSequences),
            last: Math.max(...actionSequences),
            uniqueCount: new Set(actionSequences).size,
          }
        : undefined,
    firstUrl: urls[0] || input.target.values.url || '',
    lastUrl: urls[urls.length - 1] || '',
    firstUserAction: userActionEvents[0]
      ? summarizeEvent(userActionEvents[0], events.indexOf(userActionEvents[0]))
      : undefined,
    lastUserAction: userActionEvents.at(-1)
      ? summarizeEvent(
          userActionEvents.at(-1)!,
          events.lastIndexOf(userActionEvents.at(-1)!),
        )
      : undefined,
    eventSelection: {
      maxEvents: RECORDER_METADATA_MAX_EVENT_SAMPLES,
      selectedEventIndexes: selectedEventIndexes.map((index) => index + 1),
      omittedEventCount: events.length - selectedEventIndexes.length,
    },
    events: selectedEventIndexes.map((eventIndex) =>
      summarizeEvent(events[eventIndex], eventIndex),
    ),
  };
}

function normalizeMetadataValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function generateRecorderSessionMetadata(
  input: RecorderMetadataGenerationInput,
  modelConfig: IModelConfig,
): Promise<RecorderGeneratedMetadata> {
  if (!input?.events?.length) {
    throw new Error('generateRecorderSessionMetadata: events are required.');
  }
  if (!modelConfig?.modelName) {
    throw new Error(
      'generateRecorderSessionMetadata: modelConfig.modelName is required.',
    );
  }

  const summary = summarizeRecorderEvents(input);
  const screenshots = await prepareRecorderModelInputImages(
    getMidsceneRecorderScreenshotsForLLM(
      input.events,
      input.maxScreenshots ?? 1,
    ),
    {
      ...resolveRecorderModelInputImageOptions(modelConfig),
      context: 'recorder metadata',
    },
  );
  const messageContent: any[] = [
    {
      type: 'text',
      text: `Generate a concise title (5-7 words) and brief description (1-2 sentences) for a Studio recording of user actions.

The recording can target Web, Android, iOS, HarmonyOS, or Computer. Do not assume it is a browser session unless the platform is web.
Describe what the user did or accomplished. The description should use the user as the subject, preferably starting with "The user ...". Do not start the description with "The session ...".
The title should be action-oriented and highlight the main task accomplished.
The full-session counts, actionSequence, firstUserAction, and lastUserAction below are authoritative. The events array is a bounded sample across the complete recording, not a truncated prefix. If the title or description mentions a count, range, or final item, copy it only from those authoritative fields.

Summary:
${JSON.stringify(summary, null, 2)}

Respond with a JSON object containing exactly "title" and "description".`,
    },
  ];

  for (const screenshot of screenshots) {
    messageContent.push({
      type: 'image_url',
      image_url: { url: screenshot },
    });
  }

  const response = await callAIWithObjectResponse<{
    title?: string;
    description?: string;
  }>(
    [
      {
        role: 'system',
        content:
          'You generate clear, task-oriented titles and descriptions for recorded automation sessions.',
      },
      {
        role: 'user',
        content: messageContent,
      },
    ],
    getModelRuntime(modelConfig),
  );

  return {
    title: normalizeMetadataValue(response.content.title),
    description: normalizeMetadataValue(response.content.description),
  };
}
