import assert from 'node:assert';
import { MIDSCENE_USE_QWEN_VL, getAIConfigInBoolean } from '@/env';
import type { PlanningAIResponse, UIContext } from '@/types';
import { AIActionType, type AIArgs, callAiFn } from './common';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
import { describeUserPage } from './prompt/util';

export async function plan(
  userInstruction: string,
  opts: {
    log?: string;
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, screenshotBase64WithElementMarker, size } = context;
  const { description: pageDescription } = await describeUserPage(context);

  const systemPrompt = await systemPromptToTaskPlanning();
  const taskBackgroundContextText = generateTaskBackgroundContext(
    userInstruction,
    opts.log,
  );
  const userInstructionPrompt = await automationUserPrompt().format({
    pageDescription,
    taskBackgroundContext: taskBackgroundContextText,
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
  const rawResponse = JSON.stringify(content, undefined, 2);
  const planFromAI = content;
  const actions =
    ((planFromAI as any).action
      ? [(planFromAI as any).action]
      : planFromAI.actions) || [];
  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    actions,
    rawResponse,
    usage,
  };

  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    actions.forEach((action) => {
      if (
        action.locate &&
        (action.locate as any)?.bbox_2d &&
        !action.locate?.bbox
      ) {
        // seems using the name 'bbox_2d' will accelerate the inference speed of qwen. very interesting.
        action.locate.bbox = (action.locate as any).bbox_2d;
        // biome-ignore lint/performance/noDelete: <explanation>
        delete (action.locate as any).bbox_2d;
      }

      if (action.locate?.bbox) {
        action.locate.bbox[0] = Math.ceil(action.locate.bbox[0]);
        action.locate.bbox[1] = Math.ceil(action.locate.bbox[1]);
        action.locate.bbox[2] = Math.ceil(
          action.locate.bbox[2] || action.locate.bbox[0] + 20, // sometimes the bbox is not complete
        );
        action.locate.bbox[3] = Math.ceil(
          action.locate.bbox[3] || action.locate.bbox[1] + 20,
        );
      }
    });
  }

  assert(planFromAI, "can't get plans from AI");
  assert(
    actions.length > 0 || returnValue.finish,
    `Failed to plan actions: ${planFromAI.error || '(no error details)'}`,
  );

  return returnValue;
}
