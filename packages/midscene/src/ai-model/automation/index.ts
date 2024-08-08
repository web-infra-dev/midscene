import assert from 'node:assert';
import type { PlanningAIResponse, PlanningAction, UIContext } from '@/types';
import { CozeAiActionPlan } from '../coze';
import { useCozeModel } from '../coze/base';
import { OpenAiActionPlan } from '../openai';
import { useOpenAIModel } from '../openai/base';
import { describeUserPage } from '../prompt/util';

export async function plan(
  userPrompt: string,
  opts: {
    context: UIContext;
    callAI?: typeof OpenAiActionPlan;
  },
  useModel?: 'coze' | 'openAI',
): Promise<{ plans: PlanningAction[] }> {
  const { callAI, context } = opts || {};
  const { screenshotBase64 } = context;
  const { description } = await describeUserPage(context);
  let planFromAI: PlanningAIResponse | undefined;
  if (callAI) {
    planFromAI = await callAI({
      pageDescription: description,
      actionDescription: userPrompt,
      screenshotBase64,
    });
  } else if (useOpenAIModel(useModel)) {
    planFromAI = await OpenAiActionPlan({
      pageDescription: description,
      actionDescription: userPrompt,
      screenshotBase64,
    });
  } else if (useCozeModel(useModel)) {
    planFromAI = await CozeAiActionPlan({
      pageDescription: description,
      actionDescription: userPrompt,
      screenshotBase64,
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
