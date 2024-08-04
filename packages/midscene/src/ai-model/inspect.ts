import type {
  AIElementParseResponse,
  AISectionParseResponse,
  BaseElement,
  UIContext,
} from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { callToGetJSONObject } from './openai';
import { systemPromptToFindElement } from './prompt/element_inspector';
import { describeUserPage, systemPromptToExtract } from './prompt/util';

export async function AiInspectElement<
  ElementType extends BaseElement = BaseElement,
>(options: {
  context: UIContext<ElementType>;
  multi: boolean;
  findElementDescription: string;
  callAI?: typeof callToGetJSONObject<AIElementParseResponse>;
}) {
  const {
    context,
    multi,
    findElementDescription,
    callAI = callToGetJSONObject,
  } = options;
  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  const systemPrompt = systemPromptToFindElement(findElementDescription, multi);

  const msgs: ChatCompletionMessageParam[] = [
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
          text: description,
        },
      ],
    },
  ];
  const parseResult = await callAI(msgs);
  return {
    parseResult,
    elementById,
    systemPrompt,
  };
}

export async function AiExtractElementInfo<
  T,
  ElementType extends BaseElement = BaseElement,
>(options: {
  dataQuery: string | Record<string, string>;
  sectionConstraints: {
    name: string;
    description: string;
  }[];
  context: UIContext<ElementType>;
  callAI?: typeof callToGetJSONObject;
}) {
  const {
    dataQuery,
    sectionConstraints,
    context,
    callAI = callToGetJSONObject,
  } = options;
  const systemPrompt = systemPromptToExtract(dataQuery, sectionConstraints);

  const { screenshotBase64 } = context;
  const { description, elementById } = await describeUserPage(context);

  const msgs: ChatCompletionMessageParam[] = [
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
          text: description,
        },
      ],
    },
  ];

  const parseResult = await callAI<AISectionParseResponse<T>>(msgs);
  return {
    parseResult,
    elementById,
    systemPrompt,
  };
}
