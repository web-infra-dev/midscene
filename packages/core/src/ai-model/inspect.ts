import {
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  getAIConfigInBoolean,
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
import { assert, getDebug } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  AIActionType,
  adaptBboxToRect,
  callAiFn,
  expandSearchArea,
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

function transformToAbsoluteCoords(
  relativePosition: { x: number; y: number },
  size: Size,
) {
  return {
    x: Number(((relativePosition.x / 1000) * size.width).toFixed(3)),
    y: Number(((relativePosition.y / 1000) * size.height).toFixed(3)),
  };
}

// let index = 0;
export async function transformElementPositionToId(
  aiResult: AIElementResponse | [number, number],
  treeRoot: ElementTreeNode<BaseElement>,
  size: { width: number; height: number },
  searchAreaRect: Rect | undefined,
  insertElementByPosition: (position: { x: number; y: number }) => BaseElement,
) {
  const emptyResponse: AIElementResponse = {
    errors: [],
    elements: [],
  };

  const elementAtPosition = (center: { x: number; y: number }) => {
    const element = elementByPositionWithElementInfo(treeRoot, center);
    const distanceToCenter = element
      ? distance({ x: element.center[0], y: element.center[1] }, center)
      : 0;
    return distanceToCenter <= distanceThreshold ? element : undefined;
  };

  if ('bbox' in aiResult) {
    if (
      !Array.isArray(aiResult.bbox) ||
      (aiResult.bbox as number[]).length !== 4
    ) {
      return emptyResponse;
    }

    const bbox: [number, number, number, number] = [
      aiResult.bbox[0] + (searchAreaRect?.left || 0),
      aiResult.bbox[1] + (searchAreaRect?.top || 0),
      aiResult.bbox[2] + (searchAreaRect?.left || 0),
      aiResult.bbox[3] + (searchAreaRect?.top || 0),
    ];
    const centerX = Math.round((bbox[0] + bbox[2]) / 2);
    const centerY = Math.round((bbox[1] + bbox[3]) / 2);

    let element = elementAtPosition({ x: centerX, y: centerY });

    if (!element) {
      element = insertElementByPosition({
        x: centerX,
        y: centerY,
      });
    }
    assert(
      element,
      `inspect: no element found with coordinates: ${JSON.stringify(bbox)}`,
    );
    return {
      errors: [],
      elements: [
        {
          id: element.id,
        },
      ],
      bbox,
    };
  }

  if (Array.isArray(aiResult)) {
    // [number, number] coord
    const relativePosition = aiResult;
    const absolutePosition = transformToAbsoluteCoords(
      {
        x: relativePosition[0],
        y: relativePosition[1],
      },
      size,
    );

    let element = elementAtPosition(absolutePosition);
    if (!element) {
      element = insertElementByPosition(absolutePosition);
    }

    assert(
      element,
      `inspect: no id found with position: ${JSON.stringify({ absolutePosition })}`,
    );

    return {
      errors: [],
      elements: [
        {
          id: element.id,
        },
      ],
    };
  }

  return {
    errors: aiResult.errors,
    elements: aiResult.elements,
  };
}

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
  const systemPrompt = systemPromptToLocateElement();

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
  if ('bbox' in res.content && Array.isArray(res.content.bbox)) {
    const errorMsg = res.content.errors?.length
      ? `Failed to parse bbox: ${res.content.errors?.join(',')}`
      : '';
    resRect = adaptBboxToRect(
      res.content.bbox,
      context.size.width,
      context.size.height,
      options.searchConfig?.rect?.left,
      options.searchConfig?.rect?.top,
      errorMsg,
    );
    debugInspect('resRect', resRect);
  }

  const parseResult = await transformElementPositionToId(
    res.content,
    context.tree,
    size,
    options.searchConfig?.rect,
    insertElementByPosition,
  );

  return {
    rect: resRect,
    parseResult,
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
    sectionRect = adaptBboxToRect(
      sectionBbox,
      context.size.width,
      context.size.height,
    );
    debugSection('original sectionRect %j', sectionRect);

    // expand search area to at least 200 x 200
    sectionRect = expandSearchArea(sectionRect, context.size);
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
