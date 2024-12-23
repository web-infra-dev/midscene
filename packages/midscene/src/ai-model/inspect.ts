import assert from 'node:assert';
import {
  MIDSCENE_COOKIE,
  MIDSCENE_MODEL_NAME,
  OPENAI_BASE_URL,
  getAIConfig,
  matchByTagNumber,
} from '@/env';
import type {
  AIAssertionResponse,
  AIElementResponse,
  AISectionParseResponse,
  AISingleElementResponse,
  BaseElement,
  UIContext,
} from '@/types';
import { parseNonStrictJSON } from '@/utils';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import { AIActionType, callAiFn, transformUserMessages } from './common';
import {
  multiDescription,
  systemPromptToFindElement,
} from './prompt/element_inspector';
import {
  describeUserPage,
  elementByPosition,
  elementByTagNumber,
  systemPromptToAssert,
  systemPromptToExtract,
} from './prompt/util';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
];

const liteContextConfig = {
  filterNonTextContent: true,
  truncateTextLength: 200,
};

export function transformElementPositionToId(
  aiResult: AIElementResponse,
  elementsInfo: BaseElement[],
): {
  errors: string[] | undefined;
  elements: {
    id: string;
    errors?: string[] | undefined;
  }[];
} {
  if ('number' in (aiResult as any)) {
    return {
      errors: aiResult.errors,
      elements: [
        {
          ...aiResult,
          id: elementByTagNumber(elementsInfo, Number((aiResult as any).number))
            ?.id as string,
        },
      ],
    };
  }
  return {
    errors: aiResult.errors,
    elements: aiResult.elements.map((item) => {
      if ('id' in item) {
        return item;
      }

      if ('boxTagNumber' in item) {
        const id = elementByTagNumber(
          elementsInfo,
          Number(item.boxTagNumber),
        )?.id;
        assert(
          id,
          `inspect: no id found with tag number: ${item.boxTagNumber}`,
        );
        return {
          ...item,
          id,
        };
      }

      const { position } = item;
      const id = elementByPosition(elementsInfo, position)?.id;
      assert(
        id,
        `inspect: no id found with position: ${JSON.stringify({ position })}`,
      );
      return {
        ...item,
        id,
      };
    }),
  };
}

export async function AiInspectElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  multi: boolean;
  targetElementDescription: string;
  callAI?: typeof callAiFn<AIElementResponse>;
  useModel?: 'coze' | 'openAI';
  quickAnswer?: AISingleElementResponse;
}) {
  const { context, multi, targetElementDescription, callAI, useModel } =
    options;
  const { screenshotBase64, screenshotBase64WithElementMarker } = context;
  const { description, elementById, elementByPosition } =
    await describeUserPage(context);

  // meet quick answer
  // if (options.quickAnswer) {
  //   if ('id' in options.quickAnswer) {
  //     if (elementById(options.quickAnswer.id)) {
  //       return {
  //         parseResult: {
  //           elements: [options.quickAnswer],
  //           errors: [],
  //         },
  //         elementById,
  //       };
  //     }

  //     if (!targetElementDescription) {
  //       return {
  //         parseResult: {
  //           elements: [],
  //           errors: [
  //             `inspect: cannot find the target by id: ${options.quickAnswer.id}, and no target element description is provided`,
  //           ],
  //         },
  //         elementById,
  //       };
  //     }
  //   }
  //   if (
  //     'position' in options.quickAnswer &&
  //     elementByPosition(options.quickAnswer.position)
  //   ) {
  //     return {
  //       parseResult: transformElementPositionToId(
  //         {
  //           elements: [options.quickAnswer],
  //         },
  //         context.content,
  //       ),
  //       elementById,
  //     };
  //   }
  // }

  assert(
    targetElementDescription,
    'cannot find the target element description',
  );

  const systemPrompt = systemPromptToFindElement();
  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
        {
          type: 'image_url',
          image_url: {
            url: matchByTagNumber
              ? screenshotBase64WithElementMarker
              : screenshotBase64,
          },
        },
        {
          type: 'text',
          text: `
pageDescription: \n
${description}

Here is the item user want to find. Just go ahead:
=====================================
${JSON.stringify({
  description: targetElementDescription,
  multi: multiDescription(multi),
})}
=====================================`,
        },
      ]),
    },
  ];
  if (matchByTagNumber) {
    const response = await fetch(
      `${getAIConfig(OPENAI_BASE_URL)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: getAIConfig(MIDSCENE_COOKIE) || '',
        },
        body: JSON.stringify({
          model: getAIConfig(MIDSCENE_MODEL_NAME),
          messages: msgs,
          temperature: 0.1,
        }),
      },
    );
    const data = await response.json();

    const message = data.choices[0].message.content;
    const jsonData: any = parseNonStrictJSON(message);
    // console.log('AiInspectElement jsonData', jsonData);
    return {
      parseResult: transformElementPositionToId(jsonData, context.content),
      rawResponse: jsonData,
      elementById,
      usage: data.usage,
    };
  }

  if (callAI) {
    const res = await callAI({
      msgs,
      AIActionType: AIActionType.INSPECT_ELEMENT,
      useModel,
    });
    return {
      parseResult: transformElementPositionToId(res.content, context.content),
      rawResponse: res,
      elementById,
      usage: res.usage,
    };
  }

  const inspectElement = await callAiFn<AIElementResponse>({
    msgs,
    AIActionType: AIActionType.INSPECT_ELEMENT,
    useModel,
  });

  return {
    parseResult: transformElementPositionToId(
      inspectElement.content,
      context.content,
    ),
    rawResponse: inspectElement,
    elementById,
    usage: inspectElement.usage,
  };
}

export async function AiExtractElementInfo<
  T,
  ElementType extends BaseElement = BaseElement,
>(options: {
  dataQuery: string | Record<string, string>;
  context: UIContext<ElementType>;
  useModel?: 'coze' | 'openAI';
}) {
  const { dataQuery, context, useModel } = options;
  const systemPrompt = systemPromptToExtract();

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(
    context,
    liteContextConfig,
  );

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
          },
        },
        {
          type: 'text',
          text: `
pageDescription: ${description}

Use your extract_data_from_UI skill to find the following data, placing it in the \`data\` field
DATA_DEMAND start:
=====================================
${
  typeof dataQuery === 'object'
    ? `return in key-value style object, keys are ${Object.keys(dataQuery).join(',')}`
    : ''
}
${typeof dataQuery === 'string' ? dataQuery : JSON.stringify(dataQuery, null, 2)}
=====================================
DATA_DEMAND ends.
          `,
        },
      ]),
    },
  ];

  const result = await callAiFn<AISectionParseResponse<T>>({
    msgs,
    useModel,
    AIActionType: AIActionType.EXTRACT_DATA,
  });
  return {
    parseResult: result.content,
    elementById,
    usage: result.usage,
  };
}

export async function AiAssert<
  ElementType extends BaseElement = BaseElement,
>(options: {
  assertion: string;
  context: UIContext<ElementType>;
  useModel?: 'coze' | 'openAI';
}) {
  const { assertion, context, useModel } = options;

  assert(assertion, 'assertion should be a string');

  const { screenshotBase64 } = context;
  const { description } = await describeUserPage(context, liteContextConfig);
  const systemPrompt = systemPromptToAssert();

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
          },
        },
        {
          type: 'text',
          text: `
    pageDescription: \n
    ${description}
    Here is the description of the assertion. Just go ahead:
    =====================================
    ${assertion}
    =====================================
  `,
        },
      ]),
    },
  ];

  const { content: assertResult, usage } = await callAiFn<AIAssertionResponse>({
    msgs,
    AIActionType: AIActionType.ASSERT,
    useModel,
  });
  return {
    content: assertResult,
    usage,
  };
}
