import type {
  AIAssertionResponse,
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
  UIContext,
} from '@/types';
import {
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  getAIConfigInBoolean,
  vlLocateMode,
} from '@midscene/shared/env';
import { cropByRect, paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  AIActionType,
  adaptBboxToRect,
  callAiFn,
  expandSearchArea,
  markupImageForLLM,
  mergeRects,
} from './common';
import { systemPromptToAssert } from './prompt/assertion';
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
  ChatCompletionUserMessageParam,
];

const debugInspect = getDebug('ai:inspect');
const debugSection = getDebug('ai:section');

export async function AiLocateElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  targetElementDescription: string;
  referenceImage?: ReferenceImage;
  callAI?: typeof callAiFn<AIElementResponse | [number, number]>;
  searchConfig?: Awaited<ReturnType<typeof AiLocateSection>>;
}): Promise<{
  parseResult: AIElementLocatorResponse;
  rect?: Rect;
  rawResponse: string;
  elementById: ElementById;
  usage?: AIUsageInfo;
}> {
  const { context, targetElementDescription, callAI } = options;
  const { screenshotBase64, screenshotBlob } = context;
  const { description, elementById, insertElementByPosition } =
    await describeUserPage(context);

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const userInstructionPrompt = await findElementPrompt.format({
    pageDescription: description,
    targetElementDescription,
  });
  const systemPrompt = systemPromptToLocateElement(vlLocateMode());

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
  } else if (vlLocateMode() === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
  } else if (!vlLocateMode()) {
    imagePayload = await markupImageForLLM(
      screenshotBase64,
      context.tree,
      context.size,
    );
  }

  let referenceImagePayload: string | undefined;
  if (options.referenceImage?.rect && options.referenceImage.base64) {
    referenceImagePayload = await cropByRect(
      options.referenceImage.base64,
      options.referenceImage.rect,
      getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL),
    );
  }

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        // {
        //   type: 'image_url',
        //   image_url: {
        //     url: imagePayload,
        //     detail: 'high',
        //   },
        // },
        {
          type: 'text',
          text: userInstructionPrompt,
        },
      ],
    },
  ];

  const callAIFn =
    callAI || callToGetJSONObject<AIElementResponse | [number, number]>;

  const res = await callAIFn(msgs, AIActionType.INSPECT_ELEMENT,screenshotBlob);

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
  };
}

export async function AiLocateSection(options: {
  context: UIContext<BaseElement>;
  sectionDescription: string;
  callAI?: typeof callAiFn<AISectionLocatorResponse>;
}): Promise<{
  rect?: Rect;
  imageBase64?: string;
  error?: string;
  rawResponse: string;
  usage?: AIUsageInfo;
}> {
  const { context, sectionDescription } = options;
  const { screenshotBase64 ,screenshotBlob} = context;

  const systemPrompt = systemPromptToLocateSection(vlLocateMode());
  const sectionLocatorInstructionText = await sectionLocatorInstruction.format({
    sectionDescription,
  });
  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        // {
        //   type: 'image_url',
        //   image_url: {
        //     url: screenshotBase64,
        //     detail: 'high',
        //   },
        // },
        {
          type: 'text',
          text: sectionLocatorInstructionText,
        },
      ],
    },
  ];

  const result = await callAiFn<AISectionLocatorResponse>(
    msgs,
    AIActionType.EXTRACT_DATA,
    screenshotBlob
  );

  let sectionRect: Rect | undefined;
  const sectionBbox = result.content.bbox;
  if (sectionBbox) {
    const targetRect = adaptBboxToRect(
      sectionBbox,
      context.size.width,
      context.size.height,
    );
    debugSection('original targetRect %j', targetRect);

    const referenceBboxList = result.content.references_bbox || [];
    debugSection('referenceBboxList %j', referenceBboxList);

    const referenceRects = referenceBboxList
      .filter((bbox) => Array.isArray(bbox))
      .map((bbox) => {
        return adaptBboxToRect(bbox, context.size.width, context.size.height);
      });
    debugSection('referenceRects %j', referenceRects);

    // merge the sectionRect and referenceRects
    const mergedRect = mergeRects([targetRect, ...referenceRects]);
    debugSection('mergedRect %j', mergedRect);

    // expand search area to at least 200 x 200
    sectionRect = expandSearchArea(mergedRect, context.size);
    debugSection('expanded sectionRect %j', sectionRect);
  }

  let imageBase64 = screenshotBase64;
  if (sectionRect) {
    imageBase64 = await cropByRect(
      screenshotBase64,
      sectionRect,
      getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL),
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
  context: UIContext<ElementType>;
  extractOption?: InsightExtractOption;
}) {
  const { dataQuery, context, extractOption } = options;
  const systemPrompt = systemPromptToExtract();

  const { screenshotBase64 ,screenshotBlob} = context;
  const { description, elementById } = await describeUserPage(context, {
    truncateTextLength: 200,
    filterNonTextContent: false,
    visibleOnly: false,
    domIncluded: extractOption?.domIncluded,
  });

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

  const result = await callAiFn<AIDataExtractionResponse<T>>(
    msgs,
    AIActionType.EXTRACT_DATA,
    screenshotBlob
  );
  return {
    parseResult: result.content,
    elementById,
    usage: result.usage,
  };
}

export async function AiAssert<
  ElementType extends BaseElement = BaseElement,
>(options: { assertion: string; context: UIContext<ElementType> }) {
  const { assertion, context } = options;

  assert(assertion, 'assertion should be a string');

  const { screenshotBase64 ,screenshotBlob} = context;

  const systemPrompt = systemPromptToAssert({
    isUITars: getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS),
  });

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        // {
        //   type: 'image_url',
        //   image_url: {
        //     url: screenshotBase64,
        //     detail: 'high',
        //   },
        // },
        {
          type: 'text',
          text: `
Here is the assertion. Please tell whether it is truthy according to the screenshot.
=====================================
${assertion}
=====================================
  `,
        },
      ],
    },
  ];

  const { content: assertResult, usage } = await callAiFn<AIAssertionResponse>(
    msgs,
    AIActionType.ASSERT,
    screenshotBlob
  );
  return {
    content: assertResult,
    usage,
  };
}
