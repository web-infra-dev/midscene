import type {
  AIAssertionResponse,
  AIElementParseResponse,
  PlanningAIResponse,
} from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { systemPromptToTaskPlanning } from '../automation/planning';
import {
  multiDescription,
  systemPromptToFindElement,
} from '../prompt/element_inspector';
import { systemPromptToAssert } from '../prompt/util';
import { callToGetJSONObject } from './base';

export async function OpenAiInspectElement(options: {
  findElementDescription: string;
  screenshotBase64: string;
  pageDescription: string;
  multi?: boolean;
}) {
  const {
    multi = false,
    findElementDescription,
    pageDescription,
    screenshotBase64,
  } = options;
  const systemPrompt = systemPromptToFindElement();

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
          text: pageDescription,
        },
        {
          type: 'text',
          text: JSON.stringify({
            description: findElementDescription,
            multi: multiDescription(multi),
          }),
        },
      ],
    },
  ];
  const parseResult = await callToGetJSONObject<AIElementParseResponse>(msgs);
  return parseResult;
}

export async function OpenAiActionPlan(options: {
  actionDescription: string;
  screenshotBase64: string;
  pageDescription: string;
}) {
  const { screenshotBase64, actionDescription, pageDescription } = options;
  const systemPrompt = systemPromptToTaskPlanning();
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
          text: pageDescription,
        },
        {
          type: 'text',
          text: `
                Here is the description of the task. Just go ahead:
                =====================================
                ${actionDescription}
                =====================================
            `,
        },
      ],
    },
  ];
  const planFromAI = await callToGetJSONObject<PlanningAIResponse>(msgs);
  return planFromAI;
}

export async function OpenAiAssert(opts: {
  assertion: string;
  screenshotBase64: string;
  pageDescription: string;
}) {
  const { assertion, screenshotBase64, pageDescription } = opts;
  const systemPrompt = systemPromptToAssert();

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
          text: `
            pageDescription: \n
            ${pageDescription}
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

  const assertResult = await callToGetJSONObject<AIAssertionResponse>(msgs);
  return assertResult;
}