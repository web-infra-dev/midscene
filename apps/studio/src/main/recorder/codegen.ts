import {
  type ChatCompletionMessageParam,
  callAIWithObjectResponse,
  generatePlaywrightTest,
  generateRecorderMarkdownReplay,
  generateRecorderYamlTest,
} from '@midscene/core/ai-model';
import {
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
} from '@midscene/shared/recorder';
import type {
  GenerateRecorderCodeRequest,
  GenerateRecorderCodeResult,
  GenerateRecorderMetadataRequest,
  GenerateRecorderMetadataResult,
  GenerateRecorderYamlRequest,
  GenerateRecorderYamlResult,
} from '@shared/electron-contract';

function validateRecorderCodeRequest(
  request: GenerateRecorderCodeRequest | GenerateRecorderYamlRequest,
) {
  if (!request?.input) {
    throw new Error('generateRecorderCode: input is required.');
  }
  if (!request.modelConfig?.modelName) {
    throw new Error('generateRecorderCode: modelConfig.modelName is required.');
  }
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function resolveViewportSize(request: GenerateRecorderCodeRequest) {
  const targetValues = request.input.target.values;
  const width =
    toNumber(targetValues.viewportWidth) ??
    toNumber(targetValues.width) ??
    request.input.events[0]?.pageInfo?.width ??
    1280;
  const height =
    toNumber(targetValues.viewportHeight) ??
    toNumber(targetValues.height) ??
    request.input.events[0]?.pageInfo?.height ??
    800;

  return { width, height };
}

export async function generateRecorderCodeInMain(
  request: GenerateRecorderCodeRequest,
): Promise<GenerateRecorderCodeResult> {
  validateRecorderCodeRequest(request);

  if (request.type === 'yaml') {
    const code = await generateRecorderYamlTest(
      request.input,
      request.modelConfig,
    );
    return { type: 'yaml', code };
  }

  if (request.type === 'markdown') {
    const code = await generateRecorderMarkdownReplay(
      request.input,
      request.modelConfig,
    );
    return { type: 'markdown', code };
  }

  if (request.type === 'playwright') {
    if (request.input.target.platformId !== 'web') {
      throw new Error(
        'Playwright generation is only available for Web recordings.',
      );
    }
    const code = await generatePlaywrightTest(
      request.input.events,
      {
        testName: request.input.testName,
        includeTimestamps: request.input.includeTimestamps,
        maxScreenshots: request.input.maxScreenshots,
        description: request.input.description,
        viewportSize: resolveViewportSize(request),
      },
      request.modelConfig,
    );
    return { type: 'playwright', code };
  }

  throw new Error(`Unsupported recorder code type: ${request.type}`);
}

export async function generateRecorderYamlInMain(
  request: GenerateRecorderYamlRequest,
): Promise<GenerateRecorderYamlResult> {
  validateRecorderCodeRequest(request);

  const yaml = await generateRecorderYamlTest(
    request.input,
    request.modelConfig,
  );
  return { yaml };
}

function summarizeRecorderEvents(request: GenerateRecorderMetadataRequest) {
  const events = request.input.events;
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
    platform: request.input.target.platformId,
    target: request.input.target,
    fallbackName: request.input.fallbackName,
    pageCount: navigationEvents.length,
    pageTitles: titles.slice(0, 5),
    urls: urls.slice(0, 5),
    clickCount: clickEvents.length,
    inputCount: inputEvents.length,
    scrollCount: scrollEvents.length,
    totalActions: events.length,
    firstUrl: urls[0] || request.input.target.values.url || '',
    lastUrl: urls[urls.length - 1] || '',
    events: events.slice(0, 20).map((event) => ({
      type: event.type,
      actionType: event.actionType,
      url: event.url,
      title: event.title,
      value: event.value,
      description: getMidsceneRecorderEventDescription(event),
      elementDescription: event.elementDescription,
    })),
  };
}

function normalizeMetadataValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function generateRecorderMetadataInMain(
  request: GenerateRecorderMetadataRequest,
): Promise<GenerateRecorderMetadataResult> {
  if (!request?.input?.events?.length) {
    throw new Error('generateRecorderMetadata: events are required.');
  }
  if (!request.modelConfig?.modelName) {
    throw new Error(
      'generateRecorderMetadata: modelConfig.modelName is required.',
    );
  }

  const summary = summarizeRecorderEvents(request);
  const screenshots = getMidsceneRecorderScreenshotsForLLM(
    request.input.events,
    request.input.maxScreenshots ?? 1,
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
    request.modelConfig,
  );

  return {
    title: normalizeMetadataValue(response.content.title),
    description: normalizeMetadataValue(response.content.description),
  };
}
