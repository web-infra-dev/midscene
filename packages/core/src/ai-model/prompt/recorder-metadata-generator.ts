import type { IModelConfig } from '@midscene/shared/env';
import {
  type MidsceneRecorderEvent,
  type MidsceneRecorderTarget,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
} from '@midscene/shared/recorder';
import { callAIWithObjectResponse } from '../service-caller/index';

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
    totalActions: events.length,
    firstUrl: urls[0] || input.target.values.url || '',
    lastUrl: urls[urls.length - 1] || '',
    events: events.slice(0, 20).map((event) => ({
      type: event.type,
      actionType: event.actionType,
      url: event.url,
      title: event.title,
      value: event.value,
      description: getMidsceneRecorderEventDescription(event),
      elementDescription: event.elementDescription,
      replayInstruction: event.replayInstruction,
      actionSummary: event.actionSummary,
      semanticConfidence: event.semanticConfidence,
    })),
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
  const screenshots = getMidsceneRecorderScreenshotsForLLM(
    input.events,
    input.maxScreenshots ?? 1,
  );
  const messageContent: any[] = [
    {
      type: 'text',
      text: `Generate a concise title (5-7 words) and brief description (1-2 sentences) for a Studio recording of user actions.

The recording can target Web, Android, iOS, HarmonyOS, or Computer. Do not assume it is a browser session unless the platform is web.
Describe what the user did or accomplished. The description should use the user as the subject, preferably starting with "The user ...". Do not start the description with "The session ...".
The title should be action-oriented and highlight the main task accomplished.

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
    modelConfig,
  );

  return {
    title: normalizeMetadataValue(response.content.title),
    description: normalizeMetadataValue(response.content.description),
  };
}
