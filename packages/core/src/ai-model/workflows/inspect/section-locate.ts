import {
  getModelAdapter,
  getStandardLocateResultAdapter,
} from '@/ai-model/models';
import type {
  AISectionLocatorResponse,
  AIUsageInfo,
  Rect,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { TUserPrompt } from '../../../common';
import { expandSearchArea, mergeRects } from '../../../common';
import {
  sectionLocatorInstruction,
  systemPromptToLocateSection,
} from '../../prompts/llm-section-locator';
import {
  AIResponseParseError,
  callAIWithObjectResponse,
} from '../../service-caller/index';
import { prepareModelImage } from '../image-preprocess';
import {
  type InspectAIArgs,
  extraTextFromUserPrompt,
  promptsToChatParam,
} from './helpers';
import { adaptModelLocateResultToRect } from './locate-result-rect';
import { buildSearchAreaConfig } from './search-area';
import type { SearchAreaConfig } from './types';

const debugSection = getDebug('ai:section');

export async function AiLocateSection(options: {
  context: UIContext;
  sectionDescription: TUserPrompt;
  modelConfig: IModelConfig;
  abortSignal?: AbortSignal;
}): Promise<{
  searchAreaConfig?: SearchAreaConfig;
  error?: string;
  rawResponse: string;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const screenshotBase64 = context.screenshot.base64;
  const adapter = getModelAdapter(modelFamily);
  const preparedImage = await prepareModelImage({
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
    policy: adapter.imagePreprocess,
  });

  const systemPrompt = systemPromptToLocateSection(modelFamily);
  const sectionLocatorInstructionText = sectionLocatorInstruction(
    extraTextFromUserPrompt(sectionDescription),
  );
  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: preparedImage.imageBase64,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: sectionLocatorInstructionText,
        },
      ],
    },
  ];

  if (typeof sectionDescription !== 'string') {
    const addOns = await promptsToChatParam({
      images: sectionDescription.images,
      convertHttpImage2Base64: sectionDescription.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  let result: Awaited<
    ReturnType<typeof callAIWithObjectResponse<AISectionLocatorResponse>>
  >;
  try {
    result = await callAIWithObjectResponse<AISectionLocatorResponse>(
      msgs,
      modelConfig,
      { abortSignal: options.abortSignal },
    );
  } catch (callError) {
    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    const rawResponse =
      callError instanceof AIResponseParseError
        ? callError.rawResponse
        : errorMessage;
    const usage =
      callError instanceof AIResponseParseError ? callError.usage : undefined;
    return {
      searchAreaConfig: undefined,
      error: `AI call error: ${errorMessage}`,
      rawResponse,
      usage,
    };
  }

  let searchAreaConfig:
    | Awaited<ReturnType<typeof buildSearchAreaConfig>>
    | undefined;
  const resultAdapter = getStandardLocateResultAdapter(modelFamily);
  const resultKey = resultAdapter.responseFormat.resultType;
  const sectionResult = resultAdapter.extractRawLocateResult(result.content);
  if (sectionResult) {
    const targetRect = adaptModelLocateResultToRect(sectionResult as number[], {
      width: preparedImage.preparedSize.width,
      height: preparedImage.preparedSize.height,
      bounds: preparedImage.contentSize,
      modelFamily,
    });
    debugSection('original targetRect %j', targetRect);

    const referenceBboxList =
      (result.content as unknown as Record<string, unknown>)[
        `references_${resultKey}`
      ] || [];
    debugSection('referenceBboxList %j', referenceBboxList);

    const referenceRects = (referenceBboxList as unknown[])
      .filter((bbox) => Array.isArray(bbox))
      .map((bbox) => {
        return adaptModelLocateResultToRect(bbox, {
          width: preparedImage.preparedSize.width,
          height: preparedImage.preparedSize.height,
          bounds: preparedImage.contentSize,
          modelFamily,
        });
      });
    debugSection('referenceRects %j', referenceRects);

    const mergedRect = mergeRects([targetRect, ...referenceRects]);
    debugSection('mergedRect %j', mergedRect);

    const expandedRect = expandSearchArea(mergedRect, context.shotSize);
    const originalWidth = expandedRect.width;
    const originalHeight = expandedRect.height;
    debugSection('expanded sectionRect %j', expandedRect);

    searchAreaConfig = await buildSearchAreaConfig({
      context,
      baseRect: mergedRect,
    });

    debugSection(
      'scaled sectionRect from %dx%d to %dx%d (scale=%d)',
      originalWidth,
      originalHeight,
      searchAreaConfig.rect.width,
      searchAreaConfig.rect.height,
      searchAreaConfig.mapping.scale,
    );
  }

  return {
    searchAreaConfig,
    error: result.content.error,
    rawResponse: JSON.stringify(result.content),
    usage: result.usage,
  };
}
