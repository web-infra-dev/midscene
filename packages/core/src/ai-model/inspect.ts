import type {
  AIDataExtractionResponse,
  AIElementLocateResponse,
  AISectionLocatorResponse,
  AIUsageInfo,
  Rect,
  ServiceExtractOption,
  UIContext,
} from '@/types';
import { generateElementByRect } from '@midscene/shared/extractor';
import { cropByRect, scaleImage } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { TMultimodalPrompt, TUserPrompt } from '../common';
import {
  expandSearchArea,
  multimodalPromptToChatMessages,
  userPromptToMultimodalPrompt,
  userPromptToString,
} from '../common';
import type { ModelRuntime } from './models';
import {
  extractDataQueryPrompt,
  parseXMLExtractionResponse,
  systemPromptToExtract,
} from './prompt/extraction';
import {
  findElementPrompt,
  systemPromptToLocateElement,
} from './prompt/llm-locator';
import {
  sectionLocatorInstruction,
  systemPromptToLocateSection,
} from './prompt/llm-section-locator';
import {
  orderSensitiveJudgePrompt,
  systemPromptToJudgeOrderSensitive,
} from './prompt/order-sensitive-judge';
import {
  AIResponseParseError,
  callAI,
  callAIWithObjectResponse,
} from './service-caller/index';
import { prepareModelImage } from './workflows/image-preprocess';
import {
  mergePixelBboxesToRect,
  pixelBboxToRect,
} from './workflows/inspect/locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from './workflows/inspect/search-area-mapping';
import type {
  LocateOptions,
  LocateResult,
  SearchAreaConfig,
} from './workflows/inspect/types';

export type InspectAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

const debugInspect = getDebug('ai:inspect');
const debugSection = getDebug('ai:section');

export {
  userPromptToString as extraTextFromUserPrompt,
  multimodalPromptToChatMessages as promptsToChatParam,
} from '../common';

function hasLocateResult(input: unknown, resultKey: string) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const record = input as Record<string, unknown>;
  const locateResult = record[resultKey];
  return Array.isArray(locateResult)
    ? locateResult.length > 0
    : locateResult !== undefined;
}

export async function buildSearchAreaConfig(options: {
  context: UIContext;
  baseRect: Rect;
}): Promise<SearchAreaConfig> {
  const { context, baseRect } = options;
  const scaleRatio = 2;
  const sectionRect = expandSearchArea(baseRect, context.shotSize);

  const croppedResult = await cropByRect(
    context.screenshot.base64,
    sectionRect,
  );

  const scaledResult = await scaleImage(croppedResult.imageBase64, scaleRatio);
  return {
    sourceRect: sectionRect,
    image: {
      imageBase64: scaledResult.imageBase64,
      width: scaledResult.width,
      height: scaledResult.height,
    },
    mapping: {
      offset: {
        x: sectionRect.left,
        y: sectionRect.top,
      },
      scale: scaleRatio,
    },
  };
}

export async function AiLocateElement(
  options: LocateOptions & { targetElementDescription: TUserPrompt },
): Promise<LocateResult> {
  const { targetElementDescription, ...locateOptions } = options;
  const locateAdapter = options.modelRuntime.adapter.locate;
  if (locateAdapter.kind === 'custom') {
    return locateAdapter.locateFn(targetElementDescription, locateOptions);
  }
  return genericLocate(targetElementDescription, locateOptions);
}

export async function genericLocate(
  elementDescription: TUserPrompt,
  options: LocateOptions,
): Promise<LocateResult> {
  const { context } = options;
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'generic locate requires a standard locate adapter',
  );
  const screenshotBase64 = context.screenshot.base64;

  assert(elementDescription, 'cannot find the target element description');
  const elementDescriptionText = userPromptToString(elementDescription);
  const userInstructionPrompt = findElementPrompt(elementDescriptionText);
  const systemPrompt = systemPromptToLocateElement(
    adapter.locate.resultAdapter.promptSpec,
  );

  const modelImage = options.searchConfig?.image ?? {
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };
  const preparedImage = await prepareModelImage({
    imageBase64: modelImage.imageBase64,
    width: modelImage.width,
    height: modelImage.height,
    policy: adapter.imagePreprocess,
  });

  const imagePayload = preparedImage.imageBase64;

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imagePayload,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: userInstructionPrompt,
        },
      ],
    },
  ];

  if (typeof elementDescription !== 'string') {
    const addOns = await multimodalPromptToChatMessages(
      userPromptToMultimodalPrompt(elementDescription),
    );
    msgs.push(...addOns);
  }

  let res: Awaited<
    ReturnType<typeof callAIWithObjectResponse<AIElementLocateResponse>>
  >;
  try {
    res = await callAIWithObjectResponse<AIElementLocateResponse>(
      msgs,
      modelRuntime,
      {
        abortSignal: options.abortSignal,
        jsonParserSource: 'locate',
      },
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
    const rawChoiceMessage =
      callError instanceof AIResponseParseError
        ? callError.rawChoiceMessage
        : undefined;
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors: [`AI call error: ${errorMessage}`],
      },
      rawResponse,
      rawChoiceMessage,
      usage,
      reasoning_content: undefined,
    };
  }

  const rawResponse = JSON.stringify(res.content);

  let resRect: Rect | undefined;
  let matchedElement: LocateResultElement | undefined;
  let errors: string[] | undefined =
    'errors' in res.content ? res.content.errors : [];
  const resultAdapter = adapter.locate.resultAdapter;
  if (!hasLocateResult(res.content, resultAdapter.promptSpec.resultKey)) {
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors: errors as string[],
      },
      rawResponse,
      rawChoiceMessage: res.rawChoiceMessage,
      usage: res.usage,
      reasoning_content: res.reasoning_content,
    };
  }

  try {
    const mapping = options.searchConfig?.mapping;
    const targetPixelBbox = resultAdapter.adaptElementLocateResultToPixelBbox(
      res.content,
      {
        preparedSize: preparedImage.preparedSize,
        contentSize: preparedImage.contentSize,
      },
    );
    resRect = pixelBboxToRect(
      mapSearchAreaPixelBboxToOriginalPixelBbox(targetPixelBbox, mapping),
    );

    debugInspect('resRect', resRect);

    const element: LocateResultElement = generateElementByRect(
      resRect,
      elementDescriptionText as string,
    );
    errors = [];

    if (element) {
      matchedElement = element;
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to parse locate result: ${e.message}`
        : 'unknown error in locate';
    if (!errors || errors?.length === 0) {
      errors = [msg];
    } else {
      errors.push(`(${msg})`);
    }
  }

  return {
    rect: resRect,
    parseResult: {
      element: matchedElement,
      errors: errors as string[],
    },
    rawResponse,
    rawChoiceMessage: res.rawChoiceMessage,
    usage: res.usage,
    reasoning_content: res.reasoning_content,
  };
}

export async function AiLocateSection(options: {
  context: UIContext;
  sectionDescription: TUserPrompt;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}): Promise<{
  searchAreaConfig?: SearchAreaConfig;
  error?: string;
  rawResponse: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription } = options;
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'section locate requires a standard locate adapter',
  );
  const screenshotBase64 = context.screenshot.base64;
  const preparedImage = await prepareModelImage({
    imageBase64: screenshotBase64,
    width: context.shotSize.width,
    height: context.shotSize.height,
    policy: adapter.imagePreprocess,
  });

  const systemPrompt = systemPromptToLocateSection(
    adapter.locate.resultAdapter.promptSpec,
  );
  const sectionLocatorInstructionText = sectionLocatorInstruction(
    userPromptToString(sectionDescription),
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
    const addOns = await multimodalPromptToChatMessages(
      userPromptToMultimodalPrompt(sectionDescription),
    );
    msgs.push(...addOns);
  }

  let result: Awaited<
    ReturnType<typeof callAIWithObjectResponse<AISectionLocatorResponse>>
  >;
  try {
    result = await callAIWithObjectResponse<AISectionLocatorResponse>(
      msgs,
      modelRuntime,
      {
        abortSignal: options.abortSignal,
        jsonParserSource: 'section-locator',
      },
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
    const rawChoiceMessage =
      callError instanceof AIResponseParseError
        ? callError.rawChoiceMessage
        : undefined;
    return {
      searchAreaConfig: undefined,
      error: `AI call error: ${errorMessage}`,
      rawResponse,
      rawChoiceMessage,
      usage,
    };
  }

  let searchAreaConfig:
    | Awaited<ReturnType<typeof buildSearchAreaConfig>>
    | undefined;
  let sectionError = result.content.error;
  const resultAdapter = adapter.locate.resultAdapter;
  if (!hasLocateResult(result.content, resultAdapter.promptSpec.resultKey)) {
    return {
      searchAreaConfig: undefined,
      error: sectionError,
      rawResponse: JSON.stringify(result.content),
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }

  try {
    const adaptedResult =
      resultAdapter.adaptSectionLocateResultToPixelBboxGroup(result.content, {
        preparedSize: preparedImage.preparedSize,
        contentSize: preparedImage.contentSize,
      });
    const mergedRect = mergePixelBboxesToRect([
      adaptedResult.target,
      ...(adaptedResult.references ?? []),
    ]);
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
      'scaled section image from %dx%d to %dx%d (scale=%d)',
      originalWidth,
      originalHeight,
      searchAreaConfig.image.width,
      searchAreaConfig.image.height,
      searchAreaConfig.mapping.scale,
    );
  } catch (error) {
    const parseErrorMessage =
      error instanceof Error
        ? `Failed to parse section locate result: ${error.message}`
        : 'unknown error in section locate';
    sectionError = sectionError
      ? `${sectionError} (${parseErrorMessage})`
      : parseErrorMessage;
  }

  return {
    searchAreaConfig,
    error: sectionError,
    rawResponse: JSON.stringify(result.content),
    rawChoiceMessage: result.rawChoiceMessage,
    usage: result.usage,
  };
}

export async function AiExtractElementInfo<T>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext;
  pageDescription?: string;
  extractOption?: ServiceExtractOption;
  modelRuntime: ModelRuntime;
}) {
  const { dataQuery, context, extractOption, multimodalPrompt, modelRuntime } =
    options;
  const systemPrompt = systemPromptToExtract({
    screenshotIncluded: extractOption?.screenshotIncluded !== false,
    referenceImagesIncluded: !!multimodalPrompt?.images?.length,
  });
  const screenshotBase64 = context.screenshot.base64;

  const extractDataPromptText = extractDataQueryPrompt(
    options.pageDescription || '',
    dataQuery,
  );

  const userContent: ChatCompletionUserMessageParam['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
    userContent.push({
      type: 'text',
      text: 'This is the current screenshot to evaluate. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on this screenshot and its contents when provided.',
    });

    userContent.push({
      type: 'image_url',
      image_url: {
        url: screenshotBase64,
        detail: 'high',
      },
    });
  }

  userContent.push({
    type: 'text',
    text: extractDataPromptText,
  });

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userContent,
    },
  ];

  if (multimodalPrompt) {
    const addOns = await multimodalPromptToChatMessages(multimodalPrompt);
    msgs.push(...addOns);
  }

  const {
    content: rawResponse,
    usage,
    reasoning_content,
    rawChoiceMessage,
  } = await callAI(msgs, modelRuntime);

  let parseResult: AIDataExtractionResponse<T>;
  try {
    parseResult = parseXMLExtractionResponse<T>(rawResponse);
  } catch (parseError) {
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new AIResponseParseError(
      `XML parse error: ${errorMessage}`,
      rawResponse,
      usage,
      rawChoiceMessage,
    );
  }

  return {
    parseResult,
    rawResponse,
    rawChoiceMessage,
    usage,
    reasoning_content,
  };
}

export async function AiJudgeOrderSensitive(
  description: string,
  modelRuntime: ModelRuntime,
): Promise<{
  isOrderSensitive: boolean;
  usage?: AIUsageInfo;
}> {
  const systemPrompt = systemPromptToJudgeOrderSensitive();
  const userPrompt = orderSensitiveJudgePrompt(description);

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  debugInspect('AiJudgeOrderSensitive: description=%s', description);

  const result = await callAIWithObjectResponse<{ isOrderSensitive: boolean }>(
    msgs,
    modelRuntime,
    {
      jsonParserSource: 'generic-object',
    },
  );

  return {
    isOrderSensitive: result.content.isOrderSensitive ?? false,
    usage: result.usage,
  };
}
