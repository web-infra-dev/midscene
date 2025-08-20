import type {
  AIDataExtractionResponse,
  AIElementLocatorResponse,
  AIElementResponse,
  AISectionLocatorResponse,
  AIUsageInfo,
  BaseElement,
  ElementById,
  InsightExtractOption,
  Rect,
  ReferenceImage,
  TMultimodalPrompt,
  TUserPrompt,
  UIContext,
} from '@/types';
import {
  type IModelPreferences,
  getIsUseQwenVl,
  vlLocateMode,
} from '@midscene/shared/env';
import {
  cropByRect,
  paddingToMatchBlockByBase64,
  preProcessImageUrl,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import {
  AIActionType,
  adaptBboxToRect,
  callAiFn,
  expandSearchArea,
  markupImageForLLM,
  mergeRects,
} from './common';
import {
  extractDataQueryPrompt,
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
  describeUserPage,
  distance,
  distanceThreshold,
  elementByPositionWithElementInfo,
} from './prompt/util';
import { callToGetJSONObject } from './service-caller/index';

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
            text: `reference image ${item.name}:`,
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

export async function AiLocateElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  targetElementDescription: TUserPrompt;
  referenceImage?: ReferenceImage;
  callAI?: typeof callAiFn<AIElementResponse | [number, number]>;
  searchConfig?: Awaited<ReturnType<typeof AiLocateSection>>;
}): Promise<{
  parseResult: AIElementLocatorResponse;
  rect?: Rect;
  rawResponse: string;
  elementById: ElementById;
  usage?: AIUsageInfo;
  isOrderSensitive?: boolean;
}> {
  const { context, targetElementDescription, callAI } = options;
  const { screenshotBase64 } = context;

  const modelPreferences: IModelPreferences = {
    intent: 'grounding',
  };

  const { description, elementById, insertElementByPosition } =
    await describeUserPage(context, modelPreferences);

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const userInstructionPrompt = await findElementPrompt.format({
    pageDescription: description,
    targetElementDescription: extraTextFromUserPrompt(targetElementDescription),
  });
  const systemPrompt = systemPromptToLocateElement(
    vlLocateMode(modelPreferences),
  );

  let imagePayload = screenshotBase64;

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
  } else if (vlLocateMode(modelPreferences) === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
  } else if (!vlLocateMode(modelPreferences)) {
    imagePayload = await markupImageForLLM(
      screenshotBase64,
      context.tree,
      context.size,
    );
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
          text: userInstructionPrompt,
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

  const callAIFn =
    callAI || callToGetJSONObject<AIElementResponse | [number, number]>;

  const res = await callAIFn(msgs, AIActionType.INSPECT_ELEMENT, {
    intent: 'grounding',
  });

  const rawResponse = JSON.stringify(res.content);

  let resRect: Rect | undefined;
  let matchedElements: AIElementLocatorResponse['elements'] =
    'elements' in res.content ? res.content.elements : [];
  let errors: AIElementLocatorResponse['errors'] | undefined =
    'errors' in res.content ? res.content.errors : [];
  try {
    if ('bbox' in res.content && Array.isArray(res.content.bbox)) {
      resRect = adaptBboxToRect(
        res.content.bbox,
        options.searchConfig?.rect?.width || context.size.width,
        options.searchConfig?.rect?.height || context.size.height,
        modelPreferences,
        options.searchConfig?.rect?.left,
        options.searchConfig?.rect?.top,
      );
      debugInspect('resRect', resRect);

      const rectCenter = {
        x: resRect.left + resRect.width / 2,
        y: resRect.top + resRect.height / 2,
      };
      let element = elementByPositionWithElementInfo(context.tree, rectCenter);

      const distanceToCenter = element
        ? distance({ x: element.center[0], y: element.center[1] }, rectCenter)
        : 0;

      if (!element || distanceToCenter > distanceThreshold) {
        element = insertElementByPosition(rectCenter);
      }

      if (element) {
        matchedElements = [element];
        errors = [];
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
      elements: matchedElements,
      errors,
    },
    rawResponse,
    elementById,
    usage: res.usage,
    isOrderSensitive:
      typeof res.content === 'object' &&
      res.content !== null &&
      'isOrderSensitive' in res.content
        ? (res.content as any).isOrderSensitive
        : undefined,
  };
}

export async function AiLocateSection(options: {
  context: UIContext<BaseElement>;
  sectionDescription: TUserPrompt;
  callAI?: typeof callAiFn<AISectionLocatorResponse>;
}): Promise<{
  rect?: Rect;
  imageBase64?: string;
  error?: string;
  rawResponse: string;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription } = options;
  const { screenshotBase64 } = context;

  const modelPreferences: IModelPreferences = {
    intent: 'grounding',
  };

  const systemPrompt = systemPromptToLocateSection(
    vlLocateMode(modelPreferences),
  );
  const sectionLocatorInstructionText = await sectionLocatorInstruction.format({
    sectionDescription: extraTextFromUserPrompt(sectionDescription),
  });
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

  const result = await callAiFn<AISectionLocatorResponse>(
    msgs,
    AIActionType.EXTRACT_DATA,
    {
      intent: 'grounding',
    },
  );

  let sectionRect: Rect | undefined;
  const sectionBbox = result.content.bbox;
  if (sectionBbox) {
    const targetRect = adaptBboxToRect(
      sectionBbox,
      context.size.width,
      context.size.height,
      modelPreferences,
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
          modelPreferences,
        );
      });
    debugSection('referenceRects %j', referenceRects);

    // merge the sectionRect and referenceRects
    const mergedRect = mergeRects([targetRect, ...referenceRects]);
    debugSection('mergedRect %j', mergedRect);

    // expand search area to at least 200 x 200
    sectionRect = expandSearchArea(mergedRect, context.size, modelPreferences);
    debugSection('expanded sectionRect %j', sectionRect);
  }

  let imageBase64 = screenshotBase64;
  if (sectionRect) {
    imageBase64 = await cropByRect(
      screenshotBase64,
      sectionRect,
      getIsUseQwenVl({
        intent: 'grounding',
      }),
    );
  }

  return {
    rect: sectionRect,
    imageBase64,
    error: result.content.error,
    rawResponse: JSON.stringify(result.content),
    usage: result.usage,
  };
}

export async function AiExtractElementInfo<
  T,
  ElementType extends BaseElement = BaseElement,
>(options: {
  dataQuery: string | Record<string, string>;
  multimodalPrompt?: TMultimodalPrompt;
  context: UIContext<ElementType>;
  extractOption?: InsightExtractOption;
  modelPreferences: IModelPreferences;
}) {
  const {
    dataQuery,
    context,
    extractOption,
    multimodalPrompt,
    modelPreferences,
  } = options;
  const systemPrompt = systemPromptToExtract();

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(
    context,
    modelPreferences,
    {
      truncateTextLength: 200,
      filterNonTextContent: false,
      visibleOnly: false,
      domIncluded: extractOption?.domIncluded,
    },
  );

  const extractDataPromptText = await extractDataQueryPrompt(
    description,
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

  if (options.extractOption?.returnThought) {
    msgs.push({
      role: 'user',
      content: 'Please provide reasons.',
    });
  }

  if (multimodalPrompt) {
    const addOns = await promptsToChatParam({
      images: multimodalPrompt.images,
      convertHttpImage2Base64: multimodalPrompt.convertHttpImage2Base64,
    });
    msgs.push(...addOns);
  }

  const result = await callAiFn<AIDataExtractionResponse<T>>(
    msgs,
    AIActionType.EXTRACT_DATA,
    modelPreferences,
  );
  return {
    parseResult: result.content,
    elementById,
    usage: result.usage,
  };
}
