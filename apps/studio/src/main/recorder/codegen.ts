import {
  convertRecordLogIntoMarkdown,
  describeRecorderUIEvents,
  generatePlaywrightTest,
  generateRecorderSessionMetadata,
  generateRecorderYamlTest,
} from '@midscene/core/ai-model';
import type {
  DescribeRecorderUIEventsRequest,
  DescribeRecorderUIEventsResult,
  GenerateRecorderCodeRequest,
  GenerateRecorderCodeResult,
  GenerateRecorderMetadataRequest,
  GenerateRecorderMetadataResult,
} from '@shared/electron-contract';

function validateRecorderCodeRequest(request: GenerateRecorderCodeRequest) {
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
    const code = await convertRecordLogIntoMarkdown(
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

  return generateRecorderSessionMetadata(request.input, request.modelConfig);
}

export async function describeRecorderUIEventsInMain(
  request: DescribeRecorderUIEventsRequest,
): Promise<DescribeRecorderUIEventsResult> {
  if (!request?.input?.events?.length) {
    return { events: [], results: [] };
  }
  if (!request.modelConfig?.modelName) {
    throw new Error(
      'describeRecorderUIEvents: modelConfig.modelName is required.',
    );
  }

  const results = await describeRecorderUIEvents(
    request.input.events.map((event) => ({
      event,
      target: request.input.target,
    })),
    request.modelConfig,
    {
      concurrency: 2,
    },
  );

  return {
    events: results.map((result) => result.event),
    results: results.map((result) => ({
      hashId: result.event.hashId,
      usedFallback: result.usedFallback,
      ...(result.error ? { error: result.error } : {}),
    })),
  };
}
