import assert from 'node:assert';
import {
  MATCH_BY_POSITION,
  MIDSCENE_USE_QWEN_VL,
  getAIConfigInBoolean,
} from '@/env';
import type { PlanningAIResponse, UIContext } from '@/types';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  qwenVLZoomFactor,
} from './common';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
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
  const { screenshotBase64, screenshotBase64WithElementMarker, size } = context;
  const { description: pageDescription } = await describeUserPage(context);

  const systemPrompt = await systemPromptToTaskPlanning();
  const taskBackgroundContextText = generateTaskBackgroundContext(
    userPrompt,
    opts.originalPrompt,
    opts.whatHaveDone,
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
  const actions = planFromAI?.actions || [];
  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    rawResponse,
    usage,
  };

  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    const zoomFactorX = await qwenVLZoomFactor(size.width);
    const zoomFactorY = await qwenVLZoomFactor(size.height);

    const actions = planFromAI?.actions || [];
    actions.forEach((action) => {
      if (
        action.locate &&
        (action.locate as any)?.bbox_2d &&
        !action.locate?.bbox
      ) {
        // seems qwen insists on using the name "bbox_2d", we have to follow it
        action.locate.bbox = (action.locate as any).bbox_2d;
        // biome-ignore lint/performance/noDelete: <explanation>
        delete (action.locate as any).bbox_2d;
      }

      if (action.locate?.bbox) {
        action.locate.bbox[0] = Math.ceil(action.locate.bbox[0] * zoomFactorX);
        action.locate.bbox[1] = Math.ceil(action.locate.bbox[1] * zoomFactorY);
        action.locate.bbox[2] = Math.ceil(
          (action.locate.bbox[2] || action.locate.bbox[0] + 20) * zoomFactorX, // sometimes the bbox is not complete
        );
        action.locate.bbox[3] = Math.ceil(
          (action.locate.bbox[3] || action.locate.bbox[1] + 20) * zoomFactorY,
        );
      }
    });
  }

  assert(planFromAI, "can't get plans from AI");
  assert(
    actions.length > 0,
    `Failed to plan actions: ${planFromAI.error || '(no error details)'}`,
  );

  return returnValue;
}
