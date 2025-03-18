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
import { bboxToRect } from '@/utils';
import {
  cropByRect,
  jimpFromBase64,
  jimpToBase64,
  paddingToMatchBlock,
} from '@midscene/shared/img';
import { assert, getDebug } from '@midscene/shared/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import { AIActionType, adaptBbox, adaptQwenBbox, callAiFn } from './common';
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

    const centerX = Math.round((aiResult.bbox[0] + aiResult.bbox[2]) / 2);
    const centerY = Math.round((aiResult.bbox[1] + aiResult.bbox[3]) / 2);

    let element = elementAtPosition({ x: centerX, y: centerY });

    if (!element) {
      element = insertElementByPosition({
        x: centerX,
        y: centerY,
      });
    }
    assert(
      element,
      `inspect: no element found with coordinates: ${JSON.stringify(aiResult.bbox)}`,
    );
    return {
      errors: [],
      elements: [
        {
          id: element.id,
        },
      ],
      bbox: aiResult.bbox,
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
  searchArea?: Rect;
}): Promise<{
  parseResult: AIElementLocatorResponse;
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

  let offsetX = 0;
  let offsetY = 0;

  if (options.searchArea || getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    // need image processing
    let jimpImage = await jimpFromBase64(imagePayload);

    if (options.searchArea) {
      await cropByRect(jimpImage, options.searchArea);
      offsetX = options.searchArea.left;
      offsetY = options.searchArea.top;
    }

    if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
      jimpImage = await paddingToMatchBlock(jimpImage);
    }

    imagePayload = await jimpToBase64(jimpImage);
    debugInspect(
      'image size after processing',
      jimpImage.bitmap.width,
      jimpImage.bitmap.height,
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

  const callAIFn =
    callAI || callToGetJSONObject<AIElementResponse | [number, number]>;

  const res = await callAIFn(msgs, AIActionType.INSPECT_ELEMENT);

  const rawResponse = JSON.stringify(res.content);

  if ('bbox' in res.content && Array.isArray(res.content.bbox)) {
    const errorMsg = res.content.errors?.length
      ? `Failed to parse bbox: ${res.content.errors?.join(',')}`
      : '';
    res.content.bbox = adaptBbox(
      res.content.bbox,
      context.size.width,
      context.size.height,
      errorMsg,
    );
    debugInspect('res.content.bbox after adapt', res.content.bbox);

    if (offsetX > 0 || offsetY > 0) {
      res.content.bbox = res.content.bbox.map((v, i) => {
        if (i % 2 === 0) {
          return v + offsetX;
        }
        return v + offsetY;
      }) as [number, number, number, number];
    }

    debugInspect('res.content.bbox after offset', res.content.bbox);
  }

  const parseResult = await transformElementPositionToId(
    res.content,
    context.tree,
    size,
    insertElementByPosition,
  );

  return {
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
}) {
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
  let sectionBbox = result.content.bbox;
  if (sectionBbox) {
    sectionBbox = adaptBbox(
      sectionBbox,
      context.size.width,
      context.size.height,
    );
    sectionRect = bboxToRect(sectionBbox);
  }

  return {
    rect: sectionRect,
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
