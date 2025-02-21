import assert from 'node:assert';
import { MIDSCENE_USE_QWEN_VL, getAIConfigInBoolean } from '@/env';
import type {
  PlanningAIResponse,
  PlanningLocateParam,
  UIContext,
} from '@/types';
import { AIActionType, type AIArgs, callAiFn } from './common';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
import { describeUserPage } from './prompt/util';

// transform the param of locate from qwen mode
export function fillLocateParam(locate: PlanningLocateParam) {
  if (locate?.bbox_2d && !locate?.bbox) {
    locate.bbox = locate.bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete locate.bbox_2d;
  }

  const defaultBboxSize = 10;
  if (locate?.bbox) {
    locate.bbox[0] = Math.round(locate.bbox[0]);
    locate.bbox[1] = Math.round(locate.bbox[1]);
    locate.bbox[2] =
      typeof locate.bbox[2] === 'number'
        ? Math.round(locate.bbox[2])
        : Math.round(locate.bbox[0] + defaultBboxSize);
    locate.bbox[3] =
      typeof locate.bbox[3] === 'number'
        ? Math.round(locate.bbox[3])
        : Math.round(locate.bbox[1] + defaultBboxSize);
  }

  return locate;
}

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
    (planFromAI.action ? [planFromAI.action] : planFromAI.actions) || [];
  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    actions,
    rawResponse,
    usage,
  };

  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    actions.forEach((action) => {
      if (action.locate) {
        action.locate = fillLocateParam(action.locate);
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
