import assert from 'node:assert';
import {
  MIDSCENE_MODEL_NAME,
  OPENAI_BASE_URL,
  getAIConfig,
  matchByTagNumber,
} from '@/env';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import { parseNonStrictJSON } from '@/utils';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  transformUserMessages,
} from '../common';
import { extractJSONFromCodeBlock } from '../openai';
import { systemPromptToTaskPlanning } from '../prompt/planning';
import { describeUserPage } from '../prompt/util';

export async function plan(
  userPrompt: string,
  opts: {
    whatHaveDone?: string;
    originalPrompt?: string;
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
  useModel?: 'coze' | 'openAI',
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, screenshotBase64WithElementMarker } = context;
  const {
    description: pageDescription,
    elementByPosition,
    elementByIndexId,
  } = await describeUserPage(context);
  let planFromAI: PlanningAIResponse | undefined;

  const systemPrompt = systemPromptToTaskPlanning();

  let taskBackgroundContext = '';
  if (opts.originalPrompt && opts.whatHaveDone) {
    taskBackgroundContext = `For your information, this is a task that some important person handed to you. Here is the original task description and what have been done after the previous actions:
=====================================
Original task description:
${opts.originalPrompt}
=====================================
What have been done:
${opts.whatHaveDone}
=====================================
`;
  }
  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
            // detail: 'high',
          },
        },
        {
          type: 'text',
          text: `
pageDescription:\n 
${pageDescription}
\n
Here is what you need to do now:
=====================================
${userPrompt}
=====================================

${taskBackgroundContext}
`.trim(),
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
          Cookie: process.env.MIDSCENE_COOKIE || '',
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
    const jsonData = parseNonStrictJSON(message);
    console.log('AiPlan jsonData', JSON.stringify(jsonData, null, 2));
    const actions = jsonData.actions || [];

    actions.forEach((action: any) => {
      if (action.locate) {
        if ('position' in action.locate) {
          action.locate = {
            ...action.locate,
            id: elementByPosition(action.locate.position)?.id!,
          };
        }
        if ('boxTagNumber' in action.locate) {
          action.locate = {
            ...action.locate,
            id: elementByIndexId(action.locate.boxTagNumber)?.id!,
          };
        }
      }
    });
    return jsonData;
  }

  const call = callAI || callAiFn;

  const startTime = Date.now();
  const { content, usage } = await call({
    msgs,
    AIActionType: AIActionType.PLAN,
    useModel,
  });
  const endTime = Date.now();
  console.log(`AI planning took ${endTime - startTime}ms`);

  planFromAI = content;

  const actions = planFromAI?.actions || [];
  assert(planFromAI, "can't get plans from AI");
  assert(
    actions.length > 0,
    `no actions in ai plan with context: ${planFromAI}`,
  );

  if (planFromAI.error) {
    throw new Error(planFromAI.error);
  }

  return planFromAI;
}
