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
const XML_BOUNDS_REGEX =
  /bounds=\\?["']\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]\\?["']/g;
const LOCATE_TARGET_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'screen',
  'area',
  'icon',
  'button',
  'element',
]);

type XmlBoundedRect = {
  rect: Rect;
  source: string;
};

export async function buildSearchAreaConfig(options: {
  context: UIContext;
  baseRect: Rect;
  modelFamily: IModelConfig['modelFamily'];
}): Promise<{ rect: Rect; imageBase64: string; scale: number }> {
  const { context, baseRect, modelFamily } = options;
  const scaleRatio = 2;
  const sectionRect = expandSearchArea(baseRect, context.shotSize);

  const croppedResult = await cropByRect(
    context.screenshot.base64,
    sectionRect,
    modelFamily === 'qwen2.5-vl',
  );

  const scaledResult = await scaleImage(croppedResult.imageBase64, scaleRatio);
  sectionRect.width = scaledResult.width;
  sectionRect.height = scaledResult.height;
  return {
    rect: sectionRect,
    imageBase64: scaledResult.imageBase64,
    scale: scaleRatio,
  };
}

const extraTextFromUserPrompt = (prompt: TUserPrompt): string => {
  if (typeof prompt === 'string') {
    return prompt;
  } else {
    return prompt.prompt;
  }
};

const rectRight = (rect: Rect) => rect.left + rect.width - 1;
const rectBottom = (rect: Rect) => rect.top + rect.height - 1;
const rectArea = (rect: Rect) => Math.max(0, rect.width * rect.height);

const rectFromLTRB = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rect | undefined => {
  const rect = {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(right - left + 1),
    height: Math.round(bottom - top + 1),
  };
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  return rect;
};

const intersectionArea = (a: Rect, b: Rect) => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(rectRight(a), rectRight(b));
  const bottom = Math.min(rectBottom(a), rectBottom(b));
  if (right < left || bottom < top) {
    return 0;
  }
  return (right - left + 1) * (bottom - top + 1);
};

const containmentRatio = (inner: Rect, outer: Rect) => {
  const area = rectArea(inner);
  if (area <= 0) {
    return 0;
  }
  return intersectionArea(inner, outer) / area;
};

const centerInside = (inner: Rect, outer: Rect) => {
  const centerX = inner.left + Math.floor((inner.width - 1) / 2);
  const centerY = inner.top + Math.floor((inner.height - 1) / 2);
  return (
    centerX >= outer.left &&
    centerX <= rectRight(outer) &&
    centerY >= outer.top &&
    centerY <= rectBottom(outer)
  );
};

const extractTargetTerms = (target: string) => {
  const terms = target.toLowerCase().match(/[a-z0-9_-]{3,}/g) || [];
  return terms.filter((term) => !LOCATE_TARGET_STOP_WORDS.has(term));
};

const isRelevantXmlBound = (bound: XmlBoundedRect, target: string) => {
  const terms = extractTargetTerms(target);
  if (terms.length === 0) {
    return false;
  }
  const source = bound.source.toLowerCase();
  return terms.some((term) => source.includes(term));
};

const extractXmlBoundedRects = (extraLocateContext?: string) => {
  const context = extraLocateContext?.trim();
  if (!context) {
    return [];
  }

  const boundedRects: XmlBoundedRect[] = [];
  const lines = context.split(/\r?\n/);
  for (const line of lines) {
    XML_BOUNDS_REGEX.lastIndex = 0;
    let match = XML_BOUNDS_REGEX.exec(line);
    while (match) {
      const [, left, top, right, bottom] = match;
      const rect = rectFromLTRB(
        Number(left),
        Number(top),
        Number(right),
        Number(bottom),
      );
      if (rect) {
        const start = Math.max(0, match.index - 240);
        const end = Math.min(line.length, match.index + match[0].length + 80);
        boundedRects.push({
          rect,
          source: line.slice(start, end),
        });
      }
      match = XML_BOUNDS_REGEX.exec(line);
    }
  }

  return boundedRects;
};

const rawGeminiPixelBboxToRect = (
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
) => {
  const [top, left, bottom, right] = bbox;
  if (![top, left, bottom, right].every(Number.isFinite)) {
    return undefined;
  }
  const rect = rectFromLTRB(left, top, right, bottom);
  if (!rect) {
    return undefined;
  }
  if (
    rect.left < 0 ||
    rect.top < 0 ||
    rectRight(rect) > imageWidth ||
    rectBottom(rect) > imageHeight
  ) {
    return undefined;
  }
  return rect;
};

export function recoverGeminiRawPixelBboxFromXmlBounds(options: {
  bbox: [number, number, number, number];
  parsedRect: Rect;
  imageWidth: number;
  imageHeight: number;
  modelFamily: IModelConfig['modelFamily'];
  targetElementDescription: string;
  extraLocateContext?: string;
  hasSearchConfig?: boolean;
}): Rect | undefined {
  if (
    options.modelFamily !== 'gemini' ||
    options.hasSearchConfig ||
    !options.extraLocateContext
  ) {
    return undefined;
  }

  const rawPixelRect = rawGeminiPixelBboxToRect(
    options.bbox,
    options.imageWidth,
    options.imageHeight,
  );
  if (!rawPixelRect) {
    return undefined;
  }

  const relevantBounds = extractXmlBoundedRects(
    options.extraLocateContext,
  ).filter((bound) =>
    isRelevantXmlBound(bound, options.targetElementDescription),
  );

  for (const bound of relevantBounds) {
    const rawMatchesXml =
      centerInside(rawPixelRect, bound.rect) &&
      containmentRatio(rawPixelRect, bound.rect) >= 0.8;
    if (!rawMatchesXml) {
      continue;
    }

    const parsedMatchesXml =
      centerInside(options.parsedRect, bound.rect) ||
      containmentRatio(options.parsedRect, bound.rect) >= 0.35;
    if (!parsedMatchesXml) {
      return rawPixelRect;
    }
  }

  return undefined;
}

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
  extraLocateContext?: string;
  modelConfig: IModelConfig;
  abortSignal?: AbortSignal;
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
  const userInstructionPrompt = findElementPrompt(
    targetElementDescriptionText,
    options.extraLocateContext,
  );
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
      await callAIWithStringResponse(msgs, modelConfig, {
        abortSignal: options.abortSignal,
        requestContext: options.extraLocateContext,
        requestContextLabel: 'locate',
      });

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
      {
        abortSignal: options.abortSignal,
        requestContext: options.extraLocateContext,
        requestContextLabel: 'locate',
      },
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

      const recoveredRect = recoverGeminiRawPixelBboxFromXmlBounds({
        bbox: res.content.bbox,
        parsedRect: resRect,
        imageWidth,
        imageHeight,
        modelFamily,
        targetElementDescription: targetElementDescriptionText,
        extraLocateContext: options.extraLocateContext,
        hasSearchConfig: !!options.searchConfig,
      });
      if (recoveredRect) {
        debugInspect('recovered raw pixel bbox from XML bounds', {
          bbox: res.content.bbox,
          parsedRect: resRect,
          recoveredRect,
        });
        resRect = recoveredRect;
      }

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
  abortSignal?: AbortSignal;
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
      {
        abortSignal: options.abortSignal,
      },
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

  let searchAreaConfig:
    | Awaited<ReturnType<typeof buildSearchAreaConfig>>
    | undefined;
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

    const expandedRect = expandSearchArea(mergedRect, context.shotSize);
    const originalWidth = expandedRect.width;
    const originalHeight = expandedRect.height;
    debugSection('expanded sectionRect %j', expandedRect);

    searchAreaConfig = await buildSearchAreaConfig({
      context,
      baseRect: mergedRect,
      modelFamily,
    });

    debugSection(
      'scaled sectionRect from %dx%d to %dx%d (scale=%d)',
      originalWidth,
      originalHeight,
      searchAreaConfig.rect.width,
      searchAreaConfig.rect.height,
      searchAreaConfig.scale,
    );
  }

  return {
    rect: searchAreaConfig?.rect,
    imageBase64: searchAreaConfig?.imageBase64,
    scale: searchAreaConfig?.scale,
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

  debugInspect('AiJudgeOrderSensitive: description=%s', description);

  const result = await callAIFn(msgs, modelConfig);

  return {
    isOrderSensitive: result.content.isOrderSensitive ?? false,
    usage: result.usage,
  };
}
