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
  CozeAiAssert,
  CozeAiInspectElement,
  EXTRACT_INFO_BOT_ID,
} from './coze';
import {
  callCozeAi,
  transfromOpenAiArgsToCoze,
  useCozeModel,
} from './coze/base';
import { OpenAiAssert, OpenAiInspectElement } from './openai';
import { callToGetJSONObject, useOpenAIModel } from './openai/base';
import {
  describeUserPage,
  systemPromptToAssert,
  systemPromptToExtract,
} from './prompt/util';

export async function AiInspectElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  multi: boolean;
  findElementDescription: string;
  callAI?: (
    options: Parameters<typeof OpenAiInspectElement>[0],
  ) => Promise<AIElementParseResponse>;
  useModel?: 'coze' | 'openAI';
}) {
  const { context, multi, findElementDescription, callAI, useModel } = options;
  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  if (callAI) {
    const parseResult = await callAI({
      findElementDescription,
      screenshotBase64,
      pageDescription: description,
      multi,
    });
    return {
      parseResult,
      elementById,
    };
  }

  if (useOpenAIModel(useModel)) {
    const parseResult = await OpenAiInspectElement({
      findElementDescription,
      screenshotBase64,
      pageDescription: description,
      multi,
    });
    return {
      parseResult,
      elementById,
    };
  }

  if (useCozeModel(useModel)) {
    const parseResult = await CozeAiInspectElement({
      findElementDescription,
      screenshotBase64,
      pageDescription: description,
      multi,
    });
    return {
      parseResult,
      elementById,
    };
  }

  throw Error(`can't get OpenAi and Coze model args`);
}

export async function AiExtractElementInfo<
  T,
  ElementType extends BaseElement = BaseElement,
>(options: {
  dataQuery: string | Record<string, string>;
  context: UIContext<ElementType>;
  useModel?: 'coze' | 'openAI';
  callAI?: typeof callToGetJSONObject;
}) {
  const {
    dataQuery,
    context,
    callAI = callToGetJSONObject,
    useModel,
  } = options;
  const systemPrompt = systemPromptToExtract();

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  const msgs: [
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
  ] = [
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

  if (useOpenAIModel(useModel)) {
    const parseResult = await callAI<AISectionParseResponse<T>>(msgs);
    return {
      parseResult,
      elementById,
    };
  }

  if (useCozeModel(useModel)) {
    const cozeMsg = transfromOpenAiArgsToCoze(msgs[1]);
    const parseResult = await callCozeAi({
      ...cozeMsg,
      botId: EXTRACT_INFO_BOT_ID,
    });
    return {
      parseResult,
      elementById,
    };
  }

  throw Error('Does not contain coze and openai environment variables');
}

export async function AiAssert<
  ElementType extends BaseElement = BaseElement,
>(options: {
  assertion: string;
  context: UIContext<ElementType>;
  callAI?: typeof OpenAiAssert;
  useModel?: 'coze' | 'openAI';
}) {
  const { assertion, context, callAI, useModel } = options;

  assert(assertion, 'assertion should be a string');

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  if (callAI) {
    const assertResult = await callAI({
      screenshotBase64,
      pageDescription: description,
      assertion,
    });
    return assertResult;
  }

  if (useOpenAIModel(useModel)) {
    const assertResult = await OpenAiAssert({
      screenshotBase64,
      pageDescription: description,
      assertion,
    });
    return assertResult;
  }

  if (useCozeModel(useModel)) {
    const assertResult = await CozeAiAssert({
      screenshotBase64,
      pageDescription: description,
      assertion,
    });
    return assertResult;
  }

  throw Error(`can't get OpenAi and Coze model args`);
}
