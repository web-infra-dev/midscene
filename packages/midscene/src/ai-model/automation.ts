import assert from 'node:assert';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import { PromptTemplate } from '@langchain/core/prompts';
import { AIActionType, type AIArgs, callAiFn } from './common';
import {
  automationUserPrompt,
  systemPromptToTaskPlanning,
  taskBackgroundContext,
} from './prompt/planning';
import { describeUserPage } from './prompt/util';

export async function plan(
  userPrompt: string,
  opts: {
    whatHaveDone?: string;
    originalPrompt?: string;
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, screenshotBase64WithElementMarker } = context;
  const { description: pageDescription, elementByPosition } =
    await describeUserPage(context);

  const systemPrompt = await systemPromptToTaskPlanning();
  const userInstructionPrompt = await automationUserPrompt.format({
    pageDescription,
    userPrompt,
    taskBackgroundContext: taskBackgroundContext(
      opts.originalPrompt,
      opts.whatHaveDone,
    ),
  });

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64WithElementMarker || screenshotBase64,
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

  const call = callAI || callAiFn;
  const { content, usage } = await call(msgs, AIActionType.PLAN);
  const planFromAI = content;

  const actions = planFromAI?.actions || [];
  assert(planFromAI, "can't get plans from AI");
  assert(
    actions.length > 0,
    `Failed to plan actions with context: ${planFromAI.error}`,
  );

  return planFromAI;
}
