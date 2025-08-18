import type {
  DeviceAction,
  PageType,
  PlanningAIResponse,
  UIContext,
} from '@/types';
import { vlLocateMode } from '@midscene/shared/env';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import {
  AIActionType,
  type AIArgs,
  buildYamlFlowFromPlans,
  callAiFn,
  fillBboxParam,
  findAllMidsceneLocatorField,
  markupImageForLLM,
  warnGPT4oSizeLimit,
} from './common';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
import { describeUserPage } from './prompt/util';

const debug = getDebug('planning');

export async function plan(
  userInstruction: string,
  opts: {
    context: UIContext;
    pageType: PageType;
    actionSpace: DeviceAction<any>[];
    callAI?: typeof callAiFn<PlanningAIResponse>;
    log?: string;
    actionContext?: string;
  },
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, size } = context;
  const { description: pageDescription, elementById } =
    await describeUserPage(context);

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    vlMode: vlLocateMode(),
  });
  const taskBackgroundContextText = generateTaskBackgroundContext(
    userInstruction,
    opts.log,
    opts.actionContext,
  );
  const userInstructionPrompt = await automationUserPrompt(
    vlLocateMode(),
  ).format({
    pageDescription,
    taskBackgroundContext: taskBackgroundContextText,
  });

  let imagePayload = screenshotBase64;
  if (vlLocateMode() === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
  } else if (!vlLocateMode()) {
    imagePayload = await markupImageForLLM(
      screenshotBase64,
      context.tree,
      context.size,
    );
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
    yamlFlow: buildYamlFlowFromPlans(
      actions,
      opts.actionSpace,
      planFromAI.sleep,
    ),
  };

  assert(planFromAI, "can't get plans from AI");

  // TODO: use zod.parse to parse the action.param, and then fill the bbox param.
  actions.forEach((action) => {
    const type = action.type;
    const actionInActionSpace = opts.actionSpace.find(
      (action) => action.name === type,
    );
    const locateFields = actionInActionSpace
      ? findAllMidsceneLocatorField(actionInActionSpace.paramSchema)
      : [];

    debug('locateFields', locateFields);

    locateFields.forEach((field) => {
      const value = action.param[field];
      if (value) {
        if (vlLocateMode()) {
          action.param[field] = fillBboxParam(value, size.width, size.height);
        } else {
          const element = elementById(value);
          if (element) {
            action.param[field] = element.id;
          }
        }
      }
    });
  });
  // in Qwen-VL, error means error. In GPT-4o, error may mean more actions are needed.
  assert(!planFromAI.error, `Failed to plan actions: ${planFromAI.error}`);

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
