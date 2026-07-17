import type {
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
import { callAiAndParseWithRetry } from './service-caller/semantic-retry';
import { prepareModelImage } from './workflows/image-preprocess';
import {
  mergePixelBboxesToRect,
  pixelBboxToRect,
} from './workflows/inspect/locate-result-rect';
import { mapSearchAreaPixelBboxToOriginalPixelBbox } from './workflows/inspect/search-area-mapping';
import type {
  LocateModelResponse,
  LocateOptions,
  LocateRequestContext,
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

type SectionLocateObjectResponse = Awaited<
  ReturnType<typeof callAIWithObjectResponse<AISectionLocatorResponse>>
>;

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
  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const { context } = locateOptions;
  const locateImage = locateOptions.searchConfig?.image ?? {
    imageBase64: context.screenshot.base64,
    width: context.shotSize.width,
    height: context.shotSize.height,
  };
  const referenceImageMessages =
    typeof targetElementDescription === 'string'
      ? undefined
      : await multimodalPromptToChatMessages(
          userPromptToMultimodalPrompt(targetElementDescription),
        );
  const locateRequest: LocateRequestContext = {
    elementDescriptionText: userPromptToString(targetElementDescription),
    locateImage,
    referenceImageMessages,
    options: locateOptions,
  };

  const locateAdapter = options.modelRuntime.adapter.locate;
  const locateFn =
    locateAdapter.kind === 'custom' ? locateAdapter.locateFn : genericLocate;
  const locateResponse = await locateFn(
    targetElementDescription,
    locateOptions,
    locateRequest,
  );
  const {
    locatedPixelBbox,
    rawResponse,
    rawChoiceMessage,
    usage,
    reasoningContent,
    errors = [],
  } = locateResponse;
  const baseLocateResult = {
    rawResponse,
    rawChoiceMessage,
    usage,
    reasoning_content: reasoningContent,
  };

  if (!locatedPixelBbox) {
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors,
      },
      ...baseLocateResult,
    };
  }

  try {
    const rect = pixelBboxToRect(
      mapSearchAreaPixelBboxToOriginalPixelBbox(
        locatedPixelBbox,
        locateOptions.searchConfig?.mapping,
      ),
    );
    debugInspect('resRect', rect);

    return {
      rect,
      parseResult: {
        element: generateElementByRect(
          rect,
          locateRequest.elementDescriptionText,
        ),
        errors: [],
      },
      ...baseLocateResult,
    };
  } catch (error) {
    const msg =
      error instanceof Error
        ? `Failed to parse locate result: ${error.message}`
        : 'unknown error in locate';
    return {
      rect: undefined,
      parseResult: {
        element: undefined,
        errors: errors.length > 0 ? [...errors, `(${msg})`] : [msg],
      },
      ...baseLocateResult,
    };
  }
}

export async function genericLocate(
  _elementDescription: TUserPrompt,
  options: LocateOptions,
  locateRequest: LocateRequestContext,
): Promise<LocateModelResponse> {
  const modelRuntime = options.modelRuntime;
  const { adapter } = modelRuntime;
  assert(
    adapter.locate.kind === 'standard',
    'generic locate requires a standard locate adapter',
  );
  const resultAdapter = adapter.locate.resultAdapter;
  const userInstructionPrompt = findElementPrompt(
    locateRequest.elementDescriptionText,
  );
  const systemPrompt = systemPromptToLocateElement(
    adapter.locate.resultAdapter.promptSpec,
  );

  const preparedImage = await prepareModelImage({
    imageBase64: locateRequest.locateImage.imageBase64,
    width: locateRequest.locateImage.width,
    height: locateRequest.locateImage.height,
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

  if (locateRequest.referenceImageMessages) {
    msgs.push(...locateRequest.referenceImageMessages);
  }

  try {
    return await callAiAndParseWithRetry({
      callAi: () =>
        callAIWithObjectResponse<AIElementLocateResponse>(msgs, modelRuntime, {
          abortSignal: options.abortSignal,
          jsonParserSource: 'locate',
          retryTimes: modelRuntime.config.retryCount,
          retryInterval: modelRuntime.config.retryInterval,
        }),
      parseResponse: (response): LocateModelResponse => {
        const rawResponse = response.contentString;
        const errors: string[] | undefined =
          'errors' in response.content ? response.content.errors : [];
        if (
          !hasLocateResult(response.content, resultAdapter.promptSpec.resultKey)
        ) {
          return {
            rawResponse,
            rawChoiceMessage: response.rawChoiceMessage,
            usage: response.usage,
            reasoningContent: response.reasoning_content,
            errors: errors as string[],
          };
        }

        const locatedPixelBbox =
          resultAdapter.adaptElementLocateResultToPixelBbox(response.content, {
            preparedSize: preparedImage.preparedSize,
            contentSize: preparedImage.contentSize,
          });
        return {
          locatedPixelBbox,
          rawResponse,
          rawChoiceMessage: response.rawChoiceMessage,
          usage: response.usage,
          reasoningContent: response.reasoning_content,
          errors: errors as string[],
        };
      },
      toParseError: (error, response) => {
        const parseErrorMessage =
          error instanceof Error
            ? `Failed to parse locate result: ${error.message}`
            : 'unknown error in locate result';
        const modelErrors =
          'errors' in response.content ? response.content.errors : undefined;
        const message =
          modelErrors && modelErrors.length > 0
            ? `${modelErrors.join('\n')} (${parseErrorMessage})`
            : parseErrorMessage;
        return new AIResponseParseError(
          message,
          response.contentString,
          response.usage,
          response.rawChoiceMessage,
          response.reasoning_content,
        );
      },
      parseRetryTimes: modelRuntime.config.retryCount,
      parseRetryInterval: modelRuntime.config.retryInterval,
      abortSignal: options.abortSignal,
      onParseRetry: (error) => {
        debugInspect(
          'retrying locate after coordinate parsing failed: %s',
          error instanceof Error ? error.message : String(error),
        );
      },
    });
  } catch (callError) {
    if (callError instanceof AIResponseParseError) {
      return {
        rawResponse: callError.rawResponse,
        rawChoiceMessage: callError.rawChoiceMessage,
        usage: callError.usage,
        reasoningContent: callError.reasoningContent,
        errors: [callError.message],
      };
    }

    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    return {
      rawResponse: errorMessage,
      errors: [`AI call error: ${errorMessage}`],
    };
  }
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
  const resultAdapter = adapter.locate.resultAdapter;
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

  let parsedResult:
    | {
        result: SectionLocateObjectResponse;
        sectionError?: string;
        mergedRect?: undefined;
      }
    | {
        result: SectionLocateObjectResponse;
        sectionError?: string;
        mergedRect: Rect;
      };

  try {
    parsedResult = await callAiAndParseWithRetry({
      callAi: () =>
        callAIWithObjectResponse<AISectionLocatorResponse>(msgs, modelRuntime, {
          abortSignal: options.abortSignal,
          jsonParserSource: 'section-locator',
          retryTimes: modelRuntime.config.retryCount,
          retryInterval: modelRuntime.config.retryInterval,
        }),
      parseResponse: (result) => {
        const sectionError = result.content.error;
        if (
          !hasLocateResult(result.content, resultAdapter.promptSpec.resultKey)
        ) {
          return { result, sectionError };
        }

        const adaptedResult =
          resultAdapter.adaptSectionLocateResultToPixelBboxGroup(
            result.content,
            {
              preparedSize: preparedImage.preparedSize,
              contentSize: preparedImage.contentSize,
            },
          );
        const mergedRect = mergePixelBboxesToRect([
          adaptedResult.target,
          ...(adaptedResult.references ?? []),
        ]);
        debugSection('mergedRect %j', mergedRect);
        return { result, sectionError, mergedRect };
      },
      toParseError: (error, result) => {
        const parseErrorMessage =
          error instanceof Error
            ? `Failed to parse section locate result: ${error.message}`
            : 'unknown error in section locate';
        const message = result.content.error
          ? `${result.content.error} (${parseErrorMessage})`
          : parseErrorMessage;
        return new AIResponseParseError(
          message,
          result.contentString,
          result.usage,
          result.rawChoiceMessage,
          result.reasoning_content,
        );
      },
      parseRetryTimes: modelRuntime.config.retryCount,
      parseRetryInterval: modelRuntime.config.retryInterval,
      abortSignal: options.abortSignal,
      onParseRetry: (error) => {
        debugSection(
          'retrying section locate after coordinate parsing failed: %s',
          error instanceof Error ? error.message : String(error),
        );
      },
    });
  } catch (callError) {
    if (callError instanceof AIResponseParseError) {
      return {
        searchAreaConfig: undefined,
        error: callError.message,
        rawResponse: callError.rawResponse,
        rawChoiceMessage: callError.rawChoiceMessage,
        usage: callError.usage,
      };
    }

    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    return {
      searchAreaConfig: undefined,
      error: `AI call error: ${errorMessage}`,
      rawResponse: errorMessage,
    };
  }

  const { result, sectionError, mergedRect } = parsedResult;
  if (!mergedRect) {
    return {
      searchAreaConfig: undefined,
      error: sectionError,
      rawResponse: result.contentString,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }

  try {
    const expandedRect = expandSearchArea(mergedRect, context.shotSize);
    const originalWidth = expandedRect.width;
    const originalHeight = expandedRect.height;
    debugSection('expanded sectionRect %j', expandedRect);

    const searchAreaConfig = await buildSearchAreaConfig({
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
    return {
      searchAreaConfig,
      error: sectionError,
      rawResponse: result.contentString,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  } catch (error) {
    const parseErrorMessage =
      error instanceof Error
        ? `Failed to parse section locate result: ${error.message}`
        : 'unknown error in section locate';
    const errorMessage = sectionError
      ? `${sectionError} (${parseErrorMessage})`
      : parseErrorMessage;
    return {
      searchAreaConfig: undefined,
      error: errorMessage,
      rawResponse: result.contentString,
      rawChoiceMessage: result.rawChoiceMessage,
      usage: result.usage,
    };
  }
}

export async function AiExtractElementInfo<T>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext;
  pageDescription?: string;
  extractOption?: ServiceExtractOption;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
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
    const screenshotSequence = context.screenshotSequence;
    if (screenshotSequence && screenshotSequence.length > 1) {
      userContent.push({
        type: 'text',
        text: `The following ${screenshotSequence.length} images are consecutive screenshots captured over a time window, ordered from earliest to latest (Frame 1 is first, Frame ${screenshotSequence.length} is last). They record what appeared on screen during that window. Some UI elements such as toasts, banners, or transitions may appear only in certain frames and be gone by later ones. Interpret the temporal scope from the statement or question itself: if it asks whether something appeared at any point, inspect the whole sequence; if it asks about the final or current state, use the relevant later frame; if it asks about a change or sequence, compare frames in order. Unless <DATA_DEMAND> explicitly asks for comparison or matching against reference images, base your answer on these screenshots and their contents.`,
      });

      screenshotSequence.forEach((frame, index) => {
        userContent.push({
          type: 'text',
          text: `Frame ${index + 1}/${screenshotSequence.length}`,
        });
        userContent.push({
          type: 'image_url',
          image_url: {
            url: frame.base64,
            detail: 'high',
          },
        });
      });
    } else {
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

  return callAiAndParseWithRetry({
    callAi: () =>
      callAI(msgs, modelRuntime, {
        abortSignal: options.abortSignal,
      }),
    parseResponse: (response) => {
      const {
        content: rawResponse,
        usage,
        reasoning_content,
        rawChoiceMessage,
      } = response;
      const parseResult = parseXMLExtractionResponse<T>(rawResponse);
      return {
        parseResult,
        rawResponse,
        rawChoiceMessage,
        usage,
        reasoning_content,
      };
    },
    toParseError: (parseError, response) => {
      const errorMessage =
        parseError instanceof Error ? parseError.message : String(parseError);
      return new AIResponseParseError(
        `XML parse error: ${errorMessage}`,
        response.content,
        response.usage,
        response.rawChoiceMessage,
      );
    },
    parseRetryTimes: modelRuntime.config.retryCount,
    parseRetryInterval: modelRuntime.config.retryInterval,
    abortSignal: options.abortSignal,
    onParseRetry: (error) => {
      debugInspect(
        'retrying insight after XML parsing failed: %s',
        error instanceof Error ? error.message : String(error),
      );
    },
  });
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
