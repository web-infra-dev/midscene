import assert from 'node:assert';
import type {
  AIAssertionResponse,
  AIElementParseResponse,
  AISectionParseResponse,
  BaseElement,
  UIContext,
} from '@/types';
import type {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  AI_ASSERT_BOT_ID,
  EXTRACT_INFO_BOT_ID,
  INSPECT_ELEMENT_BOT_ID,
  callCozeAi,
  transfromOpenAiArgsToCoze,
  useCozeModel,
} from './coze';
import { callToGetJSONObject, useOpenAIModel } from './openai';
import {
  multiDescription,
  systemPromptToFindElement,
} from './prompt/element_inspector';
import {
  describeUserPage,
  systemPromptToAssert,
  systemPromptToExtract,
} from './prompt/util';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
];

export async function AiInspectElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  multi: boolean;
  findElementDescription: string;
  callAI?: typeof callAiFn<AIElementParseResponse>;
  useModel?: 'coze' | 'openAI';
}) {
  const { context, multi, findElementDescription, callAI, useModel } = options;
  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  const systemPrompt = systemPromptToFindElement();

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
            pageDescription: \n
            ${description}
          `,
        },
        {
          type: 'text',
          text: `
          Here is the description of the findElement. Just go ahead:
          =====================================
          ${JSON.stringify({
            description: findElementDescription,
            multi: multiDescription(multi),
          })}
          =====================================
          `,
        },
      ],
    },
  ];

  if (callAI) {
    const parseResult = await callAI({
      msgs,
      botId: INSPECT_ELEMENT_BOT_ID,
      useModel,
    });
    return {
      parseResult,
      elementById,
    };
  }
  const inspectElement = await callAiFn<AIElementParseResponse>({
    msgs,
    botId: INSPECT_ELEMENT_BOT_ID,
    useModel,
  });

  return {
    parseResult: inspectElement,
    elementById,
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
  const { description, elementById } = await describeUserPage(context);

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
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
};
${typeof dataQuery === 'string' ? dataQuery : JSON.stringify(dataQuery, null, 2)}
=====================================
DATA_DEMAND ends.
          `,
        },
      ],
    },
  ];

  const parseResult = await callAiFn<AISectionParseResponse<T>>({
    msgs,
    useModel,
    botId: EXTRACT_INFO_BOT_ID,
  });
  return {
    parseResult,
    elementById,
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
  const { description, elementById } = await describeUserPage(context);
  const systemPrompt = systemPromptToAssert();

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
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
          `,
        },
        {
          type: 'text',
          text: `
            Here is the description of the assertion. Just go ahead:
            =====================================
            ${assertion}
            =====================================
          `,
        },
      ],
    },
  ];

  const assertResult = await callAiFn<AIAssertionResponse>({
    msgs,
    botId: AI_ASSERT_BOT_ID,
    useModel,
  });
  return assertResult;
}

export async function callAiFn<T>(options: {
  msgs: AIArgs;
  botId: string;
  useModel?: 'openAI' | 'coze';
}) {
  const { useModel, msgs, botId } = options;
  if (useOpenAIModel(useModel)) {
    const parseResult = await callToGetJSONObject<T>(msgs);
    return parseResult;
  }

  if (useCozeModel(useModel)) {
    const cozeMsg = transfromOpenAiArgsToCoze(msgs[1]);
    const parseResult = await callCozeAi<T>({
      ...cozeMsg,
      botId,
    });
    return parseResult;
  }

  throw Error('Does not contain coze and openai environment variables');
}
