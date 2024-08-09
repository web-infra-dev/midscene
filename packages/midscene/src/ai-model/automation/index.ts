import assert from 'node:assert';
import type { PlanningAIResponse, PlanningAction, UIContext } from '@/types';
import { AI_ACTION_BOT_ID } from '../coze';
import { type AIArgs, callAiFn } from '../inspect';
import { describeUserPage } from '../prompt/util';
import { systemPromptToTaskPlanning } from './planning';

export async function plan(
  userPrompt: string,
  opts: {
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
  useModel?: 'coze' | 'openAI',
): Promise<{ plans: PlanningAction[] }> {
  const { callAI, context } = opts || {};
  const { screenshotBase64 } = context;
  const { description: pageDescription } = await describeUserPage(context);
  let planFromAI: PlanningAIResponse | undefined;

  const systemPrompt = systemPromptToTaskPlanning();
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
            pageDescription: ${pageDescription}
          `,
        },
        {
          type: 'text',
          text: `
                Here is the description of the task. Just go ahead:
                =====================================
                ${userPrompt}
                =====================================
            `,
        },
      ],
    },
  ];

  if (callAI) {
    planFromAI = await callAI({
      msgs,
      botId: AI_ACTION_BOT_ID,
      useModel,
    });
  } else {
    planFromAI = await callAiFn({
      msgs,
      botId: AI_ACTION_BOT_ID,
      useModel,
    });
  }

  const actions = planFromAI?.actions || [];

  assert(planFromAI, "can't get planFromAI");
  assert(actions && actions.length > 0, 'no actions in ai plan');

  if (planFromAI.error) {
    throw new Error(planFromAI.error);
  }

  actions.forEach((task) => {
    if (task.type === 'Error') {
      throw new Error(task.thought);
    }
  });

  return { plans: actions };
}
