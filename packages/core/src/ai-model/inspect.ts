import type {
  AIDataExtractionResponse,
  AIElementResponse,
  AISectionLocatorResponse,
  AIUsageInfo,
  Rect,
  ServiceExtractOption,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import {
  generateElementByPoint,
  generateElementByRect,
} from '@midscene/shared/extractor/dom-util';
import {
  cropByRect,
  paddingToMatchBlockByBase64,
  preProcessImageUrl,
  scaleImage,
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
  targetElementDescription: TUserPrompt;
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
  const { context, targetElementDescription, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const screenshotBase64 = context.screenshot.base64;

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );
  const targetElementDescriptionText = extraTextFromUserPrompt(
    targetElementDescription,
  );
  const userInstructionPrompt = findElementPrompt(targetElementDescriptionText);
  const systemPrompt = isAutoGLM(modelFamily)
    ? getAutoGLMLocatePrompt(modelFamily)
    : systemPromptToLocateElement(modelFamily);

  let imagePayload = screenshotBase64;
  let imageWidth = context.shotSize.width;
  let imageHeight = context.shotSize.height;
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

  if (typeof targetElementDescription !== 'string') {
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

      // Apply offset if searching in a cropped area
      let finalX = pixelX;
      let finalY = pixelY;
      if (options.searchConfig?.rect) {
        finalX += options.searchConfig.rect.left;
        finalY += options.searchConfig.rect.top;
      }

      const element: LocateResultElement = generateElementByPoint(
        [finalX, finalY],
        targetElementDescriptionText as string,
      );

      resRect = element.rect;
      debugInspect('auto-glm resRect:', resRect);

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

  let res: Awaited<
    ReturnType<
      typeof callAIWithObjectResponse<AIElementResponse | [number, number]>
    >
  >;
  try {
    res = await callAIWithObjectResponse<AIElementResponse | [number, number]>(
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
  let matchedElements: LocateResultElement[] = [];
  let errors: string[] | undefined =
    'errors' in res.content ? res.content.errors : [];
  try {
    if (
      'bbox' in res.content &&
      Array.isArray(res.content.bbox) &&
      res.content.bbox.length >= 1
    ) {
      resRect = adaptBboxToRect(
        res.content.bbox,
        imageWidth,
        imageHeight,
        options.searchConfig?.rect?.left,
        options.searchConfig?.rect?.top,
        originalImageWidth,
        originalImageHeight,
        modelFamily,
        options.searchConfig?.scale,
      );

      debugInspect('resRect', resRect);

      const element: LocateResultElement = generateElementByRect(
        resRect,
        targetElementDescriptionText as string,
      );
      errors = [];

      if (element) {
        matchedElements = [element];
      }
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to parse bbox: ${e.message}`
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
      elements: matchedElements as LocateResultElement[],
      errors: errors as string[],
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
  scale?: number;
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
      context.shotSize.width,
      context.shotSize.height,
      0,
      0,
      context.shotSize.width,
      context.shotSize.height,
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
          context.shotSize.width,
          context.shotSize.height,
          0,
          0,
          context.shotSize.width,
          context.shotSize.height,
          modelFamily,
        );
      });
    debugSection('referenceRects %j', referenceRects);

    // merge the sectionRect and referenceRects
    const mergedRect = mergeRects([targetRect, ...referenceRects]);
    debugSection('mergedRect %j', mergedRect);

    sectionRect = expandSearchArea(mergedRect, context.shotSize);
    debugSection('expanded sectionRect %j', sectionRect);
  }

  let imageBase64 = screenshotBase64;
  let scale: number | undefined;

  if (sectionRect) {
    const originalWidth = sectionRect.width;
    const originalHeight = sectionRect.height;

    const croppedResult = await cropByRect(
      screenshotBase64,
      sectionRect,
      modelFamily === 'qwen2.5-vl',
    );

    const scaleRatio = 2;
    const scaledResult = await scaleImage(
      croppedResult.imageBase64,
      scaleRatio,
    );

    imageBase64 = scaledResult.imageBase64;
    scale = scaleRatio;
    sectionRect.width = scaledResult.width;
    sectionRect.height = scaledResult.height;

    debugSection(
      'scaled sectionRect from %dx%d to %dx%d (scale=%d)',
      originalWidth,
      originalHeight,
      sectionRect.width,
      sectionRect.height,
      scale,
    );
  }

  return {
    rect: sectionRect,
    imageBase64,
    scale,
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
