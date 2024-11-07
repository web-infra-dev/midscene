import assert from 'node:assert';
import type { PlanningAIResponse, PlanningAction, UIContext } from '@/types';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  transformUserMessages,
} from '../common';
import { systemPromptToTaskPlanning } from '../prompt/planning';
import { describeUserPage } from '../prompt/util';

export async function plan(
  userPrompt: string,
  opts: {
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
  useModel?: 'coze' | 'openAI',
): Promise<{
  plans: PlanningAction[];
}> {
  const { callAI, context } = opts || {};
  const { screenshotBase64 } = context;
  const { description: pageDescription, elementByPosition } =
    await describeUserPage(context);
  let planFromAI: PlanningAIResponse | undefined;

  const systemPrompt = systemPromptToTaskPlanning();

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
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
            pageDescription:\n 
            ${pageDescription}
            \n
            Here is the description of the task. Just go ahead:
            =====================================
            ${userPrompt}
            =====================================
          `,
        },
      ]),
    },
  ];

  const call = callAI || callAiFn;
  planFromAI = await call({
    msgs,
    AIActionType: AIActionType.PLAN,
    useModel,
  });

  const actions = planFromAI?.actions || [];

  assert(planFromAI, "can't get planFromAI");
  assert(
    actions.length > 0,
    `no actions in ai plan with context: ${planFromAI}`,
  );

  actions.forEach((action) => {
    if (action.type === 'Locate' && action.quickAnswer) {
      if ('id' in action.quickAnswer) {
        return;
      }

      if ('position' in action.quickAnswer) {
        action.quickAnswer = {
          ...action.quickAnswer,
          id: elementByPosition(action.quickAnswer.position)?.id!,
        };
      }
    }
  });

  if (planFromAI.error) {
    throw new Error(planFromAI.error);
  }

  return { plans: actions };
}
