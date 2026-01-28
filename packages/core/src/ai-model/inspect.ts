import type {
  AIDataExtractionResponse,
  AIElementArrayResponse,
  AIElementResponse,
  AISectionLocatorResponse,
  AIUsageInfo,
  Rect,
  ServiceExtractOption,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { generateElementByPosition } from '@midscene/shared/extractor/dom-util';
import {
  cropByRect,
  paddingToMatchBlockByBase64,
  preProcessImageUrl,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { LocateResultElement } from '@midscene/shared/types';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { TMultimodalPrompt, TUserPrompt } from '../common';
import { adaptBboxToRect, expandSearchArea, mergeRects } from '../common';
import { parseAutoGLMLocateResponse } from './auto-glm/parser';
import { getAutoGLMLocatePrompt } from './auto-glm/prompt';
import { isAutoGLM } from './auto-glm/util';
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
  callAIWithStringResponse,
} from './service-caller/index';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

const debugInspect = getDebug('ai:inspect');
const debugSection = getDebug('ai:section');

const extraTextFromUserPrompt = (prompt: TUserPrompt): string => {
  if (typeof prompt === 'string') {
    return prompt;
  } else {
    return prompt.prompt;
  }
};

const promptsToChatParam = async (
  multimodalPrompt: TMultimodalPrompt,
): Promise<ChatCompletionUserMessageParam[]> => {
  const msgs: ChatCompletionUserMessageParam[] = [];
  if (multimodalPrompt?.images?.length) {
    msgs.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Next, I will provide all the reference images.',
        },
      ],
    });

    for (const item of multimodalPrompt.images) {
      const base64 = await preProcessImageUrl(
        item.url,
        !!multimodalPrompt.convertHttpImage2Base64,
      );

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `this is the reference image named '${item.name}':`,
          },
        ],
      });

      msgs.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: base64,
              detail: 'high',
            },
          },
        ],
      });
    }
  }
  return msgs;
};

export async function AiLocateElement(options: {
  context: UIContext;
  targetElementDescription: TUserPrompt | TUserPrompt[];
  callAIFn: typeof callAIWithObjectResponse<
    AIElementResponse | AIElementArrayResponse | [number, number]
  >;
  searchConfig?: Awaited<ReturnType<typeof AiLocateSection>>;
  modelConfig: IModelConfig;
}): Promise<{
  parseResult: {
    elements: LocateResultElement[];
    errors?: string[];
  };
  rect?: Rect;
  rawResponse: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}> {
  const { context, targetElementDescription, callAIFn, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const screenshotBase64 = context.screenshot.base64;

  const isArrayMode = Array.isArray(targetElementDescription);

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  // For array mode, extract all description texts
  const descriptionTexts: string[] = isArrayMode
    ? targetElementDescription.map((desc) => extraTextFromUserPrompt(desc))
    : [extraTextFromUserPrompt(targetElementDescription)];

  const userInstructionPrompt = isArrayMode
    ? findElementPrompt(descriptionTexts)
    : findElementPrompt(descriptionTexts[0]);

  const systemPrompt = isAutoGLM(modelFamily)
    ? getAutoGLMLocatePrompt(modelFamily)
    : systemPromptToLocateElement(modelFamily, { isArray: isArrayMode });

  let imagePayload = screenshotBase64;
  let imageWidth = context.size.width;
  let imageHeight = context.size.height;
  let originalImageWidth = imageWidth;
  let originalImageHeight = imageHeight;

  if (options.searchConfig) {
    assert(
      options.searchConfig.rect,
      'searchArea is provided but its rect cannot be found. Failed to locate element',
    );
    assert(
      options.searchConfig.imageBase64,
      'searchArea is provided but its imageBase64 cannot be found. Failed to locate element',
    );

    imagePayload = options.searchConfig.imageBase64;
    imageWidth = options.searchConfig.rect?.width;
    imageHeight = options.searchConfig.rect?.height;
    originalImageWidth = imageWidth;
    originalImageHeight = imageHeight;
  } else if (modelFamily === 'qwen2.5-vl') {
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  }

  const msgs: AIArgs = [
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
          text: isAutoGLM(modelFamily)
            ? `Tap: ${userInstructionPrompt}`
            : userInstructionPrompt,
        },
      ],
    },
  ];

  // Add reference images from prompts
  if (isArrayMode) {
    for (const desc of targetElementDescription) {
      if (typeof desc !== 'string' && desc.images?.length) {
        const addOns = await promptsToChatParam({
          images: desc.images,
          convertHttpImage2Base64: desc.convertHttpImage2Base64,
        });
        msgs.push(...addOns);
      }
    }
  } else if (typeof targetElementDescription !== 'string') {
    const addOns = await promptsToChatParam({
      images: targetElementDescription.images,
      convertHttpImage2Base64: targetElementDescription.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  if (isAutoGLM(modelFamily)) {
    const { content: rawResponseContent, usage } =
      await callAIWithStringResponse(msgs, modelConfig);

    debugInspect('auto-glm rawResponse:', rawResponseContent);

    const parsed = parseAutoGLMLocateResponse(rawResponseContent);

    debugInspect('auto-glm thinking:', parsed.think);
    debugInspect('auto-glm coordinates:', parsed.coordinates);

    let resRect: Rect | undefined;
    let matchedElements: LocateResultElement[] = [];
    let errors: string[] = [];

    if (parsed.error || !parsed.coordinates) {
      errors = [parsed.error || 'Failed to parse auto-glm response'];
      debugInspect('auto-glm parse error:', errors[0]);
    } else {
      const { x, y } = parsed.coordinates;

      debugInspect('auto-glm coordinates [0-999]:', { x, y });

      // Convert auto-glm coordinates [0,999] to pixel bbox
      // Map from [0,999] to pixel coordinates
      const pixelX = Math.round((x * imageWidth) / 1000);
      const pixelY = Math.round((y * imageHeight) / 1000);

      debugInspect('auto-glm pixel coordinates:', { pixelX, pixelY });

      // Create a small bbox around the point
      const bboxSize = 10;
      const x1 = Math.max(pixelX - bboxSize / 2, 0);
      const y1 = Math.max(pixelY - bboxSize / 2, 0);
      const x2 = Math.min(pixelX + bboxSize / 2, imageWidth);
      const y2 = Math.min(pixelY + bboxSize / 2, imageHeight);

      // Convert to Rect format
      resRect = {
        left: x1,
        top: y1,
        width: x2 - x1,
        height: y2 - y1,
      };

      // Apply offset if searching in a cropped area
      if (options.searchConfig?.rect) {
        resRect.left += options.searchConfig.rect.left;
        resRect.top += options.searchConfig.rect.top;
      }

      debugInspect('auto-glm resRect:', resRect);

      const rectCenter = {
        x: resRect.left + resRect.width / 2,
        y: resRect.top + resRect.height / 2,
      };

      const element: LocateResultElement = generateElementByPosition(
        rectCenter,
        targetElementDescriptionText as string,
      );

      if (element) {
        matchedElements = [element];
      }
    }

    return {
      rect: resRect,
      parseResult: {
        elements: matchedElements,
        errors,
      },
      rawResponse: rawResponseContent,
      usage,
      reasoning_content: parsed.think,
    };
  }

  let res: Awaited<ReturnType<typeof callAIFn>>;
  try {
    res = await callAIFn(msgs, modelConfig);
  } catch (callError) {
    // Return error with usage and rawResponse if available
    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    const rawResponse =
      callError instanceof AIResponseParseError
        ? callError.rawResponse
        : errorMessage;
    const usage =
      callError instanceof AIResponseParseError ? callError.usage : undefined;
    return {
      rect: undefined,
      parseResult: {
        elements: [],
        errors: [`AI call error: ${errorMessage}`],
      },
      rawResponse,
      usage,
      reasoning_content: undefined,
    };
  }

  const rawResponse = JSON.stringify(res.content);

  let resRect: Rect | undefined;
  const matchedElements: LocateResultElement[] = [];
  const errors: string[] =
    'errors' in res.content && res.content.errors ? [...res.content.errors] : [];

  // Normalize response to array of bbox items for unified processing
  type BboxItem = {
    bbox: [number, number, number, number] | [];
    index: number;
    errors?: string[];
  };
  const bboxItems: BboxItem[] = [];

  if (isArrayMode && 'elements' in res.content) {
    const arrayResponse = res.content as AIElementArrayResponse;
    if (arrayResponse.elements) {
      for (const elem of arrayResponse.elements) {
        bboxItems.push({
          bbox: elem.bbox,
          index: elem.indexId,
          errors: elem.errors,
        });
      }
    }
  } else if ('bbox' in res.content && Array.isArray(res.content.bbox)) {
    bboxItems.push({
      bbox: res.content.bbox as [number, number, number, number],
      index: 0,
    });
  }

  // Process each bbox item
  for (let i = 0; i < descriptionTexts.length; i++) {
    const item = bboxItems.find((b) => b.index === i);

    if (!item || !item.bbox || item.bbox.length < 4) {
      if (item?.errors?.length) {
        errors.push(...item.errors);
      }
      continue;
    }

    try {
      const elemRect = adaptBboxToRect(
        item.bbox as [number, number, number, number],
        imageWidth,
        imageHeight,
        options.searchConfig?.rect?.left,
        options.searchConfig?.rect?.top,
        originalImageWidth,
        originalImageHeight,
        modelFamily,
      );

      if (!isArrayMode) {
        debugInspect('resRect', elemRect);
      }

      const rectCenter = {
        x: elemRect.left + elemRect.width / 2,
        y: elemRect.top + elemRect.height / 2,
      };

      const element: LocateResultElement = generateElementByPosition(
        rectCenter,
        descriptionTexts[i],
      );

      if (element) {
        matchedElements.push(element);
      }

      // Use the first found rect as the main rect
      if (!resRect) {
        resRect = elemRect;
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? `Failed to parse bbox${isArrayMode ? ` at index ${i}` : ''}: ${e.message}`
          : `Unknown error${isArrayMode ? ` at index ${i}` : ''} in locate`;
      errors.push(msg);
    }
  }

  return {
    rect: resRect,
    parseResult: {
      elements: matchedElements,
      errors,
    },
    rawResponse,
    usage: res.usage,
    reasoning_content: res.reasoning_content,
  };
}

export async function AiLocateSection(options: {
  context: UIContext;
  sectionDescription: TUserPrompt;
  modelConfig: IModelConfig;
}): Promise<{
  rect?: Rect;
  imageBase64?: string;
  error?: string;
  rawResponse: string;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const screenshotBase64 = context.screenshot.base64;

  const systemPrompt = systemPromptToLocateSection(modelFamily);
  const sectionLocatorInstructionText = sectionLocatorInstruction(
    extraTextFromUserPrompt(sectionDescription),
  );
  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
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
    );
  } catch (callError) {
    // Return error with usage and rawResponse if available
    const errorMessage =
      callError instanceof Error ? callError.message : String(callError);
    const rawResponse =
      callError instanceof AIResponseParseError
        ? callError.rawResponse
        : errorMessage;
    const usage =
      callError instanceof AIResponseParseError ? callError.usage : undefined;
    return {
      rect: undefined,
      imageBase64: undefined,
      error: `AI call error: ${errorMessage}`,
      rawResponse,
      usage,
    };
  }

  let sectionRect: Rect | undefined;
  const sectionBbox = result.content.bbox;
  if (sectionBbox) {
    const targetRect = adaptBboxToRect(
      sectionBbox,
      context.size.width,
      context.size.height,
      0,
      0,
      context.size.width,
      context.size.height,
      modelFamily,
    );
    debugSection('original targetRect %j', targetRect);

    const referenceBboxList = result.content.references_bbox || [];
    debugSection('referenceBboxList %j', referenceBboxList);

    const referenceRects = referenceBboxList
      .filter((bbox) => Array.isArray(bbox))
      .map((bbox) => {
        return adaptBboxToRect(
          bbox,
          context.size.width,
          context.size.height,
          0,
          0,
          context.size.width,
          context.size.height,
          modelFamily,
        );
      });
    debugSection('referenceRects %j', referenceRects);

    // merge the sectionRect and referenceRects
    const mergedRect = mergeRects([targetRect, ...referenceRects]);
    debugSection('mergedRect %j', mergedRect);

    // expand search area to at least 200 x 200
    sectionRect = expandSearchArea(mergedRect, context.size, modelFamily);
    debugSection('expanded sectionRect %j', sectionRect);
  }

  let imageBase64 = screenshotBase64;
  if (sectionRect) {
    const croppedResult = await cropByRect(
      screenshotBase64,
      sectionRect,
      modelFamily === 'qwen2.5-vl',
    );
    imageBase64 = croppedResult.imageBase64;
    sectionRect.width = croppedResult.width;
    sectionRect.height = croppedResult.height;
  }

  return {
    rect: sectionRect,
    imageBase64,
    error: result.content.error,
    rawResponse: JSON.stringify(result.content),
    usage: result.usage,
  };
}

export async function AiExtractElementInfo<T>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext;
  pageDescription?: string;
  extractOption?: ServiceExtractOption;
  modelConfig: IModelConfig;
}) {
  const { dataQuery, context, extractOption, multimodalPrompt, modelConfig } =
    options;
  const systemPrompt = systemPromptToExtract();
  const screenshotBase64 = context.screenshot.base64;

  const extractDataPromptText = extractDataQueryPrompt(
    options.pageDescription || '',
    dataQuery,
  );

  const userContent: ChatCompletionUserMessageParam['content'] = [];

  if (extractOption?.screenshotIncluded !== false) {
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

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userContent,
    },
  ];

  if (multimodalPrompt) {
    const addOns = await promptsToChatParam({
      images: multimodalPrompt.images,
      convertHttpImage2Base64: multimodalPrompt.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  const {
    content: rawResponse,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig);

  // Parse XML response to JSON object
  let parseResult: AIDataExtractionResponse<T>;
  try {
    parseResult = parseXMLExtractionResponse<T>(rawResponse);
  } catch (parseError) {
    // Throw AIResponseParseError with usage and rawResponse preserved
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new AIResponseParseError(
      `XML parse error: ${errorMessage}`,
      rawResponse,
      usage,
    );
  }

  return {
    parseResult,
    rawResponse,
    usage,
    reasoning_content,
  };
}

export async function AiJudgeOrderSensitive(
  description: string,
  callAIFn: typeof callAIWithObjectResponse<{ isOrderSensitive: boolean }>,
  modelConfig: IModelConfig,
): Promise<{
  isOrderSensitive: boolean;
  usage?: AIUsageInfo;
}> {
  const systemPrompt = systemPromptToJudgeOrderSensitive();
  const userPrompt = orderSensitiveJudgePrompt(description);

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  const result = await callAIFn(msgs, modelConfig);

  return {
    isOrderSensitive: result.content.isOrderSensitive ?? false,
    usage: result.usage,
  };
}
