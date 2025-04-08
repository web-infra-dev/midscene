import {
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  getAIConfigInBoolean,
  vlLocateMode,
} from '@/env';
import type {
  AIAssertionResponse,
  AIDataExtractionResponse,
  AIElementLocatorResponse,
  AIElementResponse,
  AISectionLocatorResponse,
  AISingleElementResponse,
  AISingleElementResponseByPosition,
  AIUsageInfo,
  BaseElement,
  ElementById,
  ElementTreeNode,
  Rect,
  Size,
  UIContext,
} from '@/types';
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
  mergeRects,
} from './common';
import { systemPromptToAssert } from './prompt/assertion';
import { extractDataPrompt, systemPromptToExtract } from './prompt/extraction';
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

const liteContextConfig = {
  filterNonTextContent: true,
  truncateTextLength: 200,
};

const debugInspect = getDebug('ai:inspect');
const debugSection = getDebug('ai:section');

function matchQuickAnswer(
  quickAnswer:
    | Partial<AISingleElementResponse>
    | Partial<AISingleElementResponseByPosition>
    | undefined,
  tree: ElementTreeNode<BaseElement>,
  elementById: ElementById,
  insertElementByPosition: (position: { x: number; y: number }) => BaseElement,
): Awaited<ReturnType<typeof AiLocateElement>> | undefined {
  if (!quickAnswer) {
    return undefined;
  }
  if ('id' in quickAnswer && quickAnswer.id && elementById(quickAnswer.id)) {
    return {
      parseResult: {
        elements: [quickAnswer as AISingleElementResponse],
        errors: [],
      },
      rawResponse: JSON.stringify(quickAnswer),
      elementById,
    };
  }

  if ('bbox' in quickAnswer && quickAnswer.bbox) {
    const centerPosition = {
      x: Math.floor((quickAnswer.bbox[0] + quickAnswer.bbox[2]) / 2),
      y: Math.floor((quickAnswer.bbox[1] + quickAnswer.bbox[3]) / 2),
    };
    let element = elementByPositionWithElementInfo(tree, centerPosition);
    if (!element) {
      element = insertElementByPosition(centerPosition);
    }
    return {
      parseResult: {
        elements: [element],
        errors: [],
      },
      rawResponse: quickAnswer,
      elementById,
    } as any;
  }

  return undefined;
}

export async function AiLocateElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  targetElementDescription: string;
  callAI?: typeof callAiFn<AIElementResponse | [number, number]>;
  quickAnswer?: Partial<
    AISingleElementResponse | AISingleElementResponseByPosition
  >;
  searchConfig?: Awaited<ReturnType<typeof AiLocateSection>>;
}): Promise<{
  parseResult: AIElementLocatorResponse;
  rect?: Rect;
  rawResponse: string;
  elementById: ElementById;
  usage?: AIUsageInfo;
}> {
  const { context, targetElementDescription, callAI } = options;
  const { screenshotBase64, screenshotBase64WithElementMarker } = context;
  const { description, elementById, insertElementByPosition, size } =
    await describeUserPage(context);
  // meet quick answer
  const quickAnswer = matchQuickAnswer(
    options.quickAnswer,
    context.tree,
    elementById,
    insertElementByPosition,
  );
  if (quickAnswer) {
    return quickAnswer;
  }

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const userInstructionPrompt = await findElementPrompt.format({
    pageDescription: description,
    targetElementDescription,
  });
  const systemPrompt = systemPromptToLocateElement(!!vlLocateMode());

  let imagePayload = screenshotBase64WithElementMarker || screenshotBase64;

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
  } else if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
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

  const callAIFn =
    callAI || callToGetJSONObject<AIElementResponse | [number, number]>;

  const res = await callAIFn(msgs, AIActionType.INSPECT_ELEMENT);

  const rawResponse = JSON.stringify(res.content);

  let resRect: Rect | undefined;
  let matchedElements: AIElementLocatorResponse['elements'] =
    'elements' in res.content ? res.content.elements : [];
  let errors: AIElementLocatorResponse['errors'] | undefined =
    'errors' in res.content ? res.content.errors : [];
  if ('bbox' in res.content && Array.isArray(res.content.bbox)) {
    const errorMsg = res.content.errors?.length
      ? `Failed to parse bbox: ${res.content.errors?.join(',')}`
      : '';

    resRect = adaptBboxToRect(
      res.content.bbox,
      options.searchConfig?.rect?.width || context.size.width,
      options.searchConfig?.rect?.height || context.size.height,
      options.searchConfig?.rect?.left,
      options.searchConfig?.rect?.top,
      errorMsg,
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
  const { screenshotBase64 } = context;

  const systemPrompt = systemPromptToLocateSection();
  const sectionLocatorInstructionText = await sectionLocatorInstruction.format({
    sectionDescription,
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

  const result = await callAiFn<AISectionLocatorResponse>(
    msgs,
    AIActionType.EXTRACT_DATA,
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
}) {
  const { dataQuery, context } = options;
  const systemPrompt = systemPromptToExtract();

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(
    context,
    liteContextConfig,
  );

  let dataKeys = '';
  let dataQueryText = '';
  if (typeof dataQuery === 'string') {
    dataKeys = '';
    dataQueryText = dataQuery;
  } else {
    dataKeys = `return in key-value style object, keys are ${Object.keys(dataQuery).join(',')}`;
    dataQueryText = JSON.stringify(dataQuery, null, 2);
  }
  const extractDataPromptText = await extractDataPrompt.format({
    pageDescription: description,
    dataKeys,
    dataQuery: dataQueryText,
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
          text: extractDataPromptText,
        },
      ],
    },
  ];

  const result = await callAiFn<AIDataExtractionResponse<T>>(
    msgs,
    AIActionType.EXTRACT_DATA,
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

  const { screenshotBase64 } = context;

  const systemPrompt = systemPromptToAssert({
    isUITars: getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS),
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
  );
  return {
    content: assertResult,
    usage,
  };
}
