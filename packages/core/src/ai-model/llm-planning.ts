import { vlLocateMode } from '@/env';
import type { PlanningAIResponse, UIContext } from '@/types';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  fillLocateParam,
  warnGPT4oSizeLimit,
} from './common';
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
    actionContext?: string;
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, screenshotBase64WithElementMarker, size } = context;
  const { description: pageDescription } = await describeUserPage(context);

  const systemPrompt = await systemPromptToTaskPlanning(vlLocateMode());
  const taskBackgroundContextText = generateTaskBackgroundContext(
    userInstruction,
    opts.log,
    opts.actionContext,
  );
  const userInstructionPrompt = await automationUserPrompt().format({
    pageDescription,
    taskBackgroundContext: taskBackgroundContextText,
  });

  let imagePayload = screenshotBase64WithElementMarker || screenshotBase64;
  if (vlLocateMode() === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
  }

  warnGPT4oSizeLimit(size);

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imagePayload,
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
    (planFromAI.action?.type ? [planFromAI.action] : planFromAI.actions) || [];
  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    actions,
    rawResponse,
    usage,
  };

  assert(planFromAI, "can't get plans from AI");

  if (vlLocateMode()) {
    actions.forEach((action) => {
      if (action.locate) {
        try {
          action.locate = fillLocateParam(
            action.locate,
            size.width,
            size.height,
          );
        } catch (e) {
          throw new Error(
            `Failed to fill locate param: ${planFromAI.error} (${
              e instanceof Error ? e.message : 'unknown error'
            })`,
            {
              cause: e,
            },
          );
        }
      }
    });
    // in Qwen-VL, error means error. In GPT-4o, error may mean more actions are needed.
    assert(!planFromAI.error, `Failed to plan actions: ${planFromAI.error}`);
  }

  if (
    actions.length === 0 &&
    returnValue.more_actions_needed_by_instruction &&
    !returnValue.sleep
  ) {
    console.warn(
      'No actions planned for the prompt, but model said more actions are needed:',
      userInstruction,
    );
  }

  return returnValue;
}
