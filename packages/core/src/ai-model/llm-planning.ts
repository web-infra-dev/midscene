import type {
  MidsceneYamlFlowItem,
  PageType,
  PlanningAIResponse,
  PlanningAction,
  PlanningActionParamInputOrKeyPress,
  PlanningActionParamScroll,
  PlanningActionParamSleep,
  UIContext,
} from '@/types';
import { vlLocateMode } from '@midscene/shared/env';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  fillBboxParam,
  markupImageForLLM,
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
    context: UIContext;
    pageType: PageType;
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
    pageType: opts.pageType,
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
    yamlFlow: buildYamlFlowFromPlans(actions, planFromAI.sleep),
  };

  assert(planFromAI, "can't get plans from AI");

  if (vlLocateMode()) {
    actions.forEach((action) => {
      if (action.locate) {
        try {
          action.locate = fillBboxParam(action.locate, size.width, size.height);
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
  } else {
    actions.forEach((action) => {
      if (action.locate?.id) {
        // The model may return indexId, need to perform a query correction to avoid exceptions
        const element = elementById(action.locate.id);
        if (element) {
          action.locate.id = element.id;
        }
      }
    });
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

export function buildYamlFlowFromPlans(
  plans: PlanningAction[],
  sleep?: number,
): MidsceneYamlFlowItem[] {
  const flow: MidsceneYamlFlowItem[] = [];

  for (const plan of plans) {
    const type = plan.type;
    const locate = plan.locate?.prompt!; // TODO: check if locate is null

    if (type === 'Tap') {
      flow.push({
        aiTap: locate!,
      });
    } else if (type === 'Hover') {
      flow.push({
        aiHover: locate!,
      });
    } else if (type === 'Input') {
      const param = plan.param as PlanningActionParamInputOrKeyPress;
      flow.push({
        aiInput: param.value,
        locate,
      });
    } else if (type === 'KeyboardPress') {
      const param = plan.param as PlanningActionParamInputOrKeyPress;
      flow.push({
        aiKeyboardPress: param.value,
        locate,
      });
    } else if (type === 'Scroll') {
      const param = plan.param as PlanningActionParamScroll;
      flow.push({
        aiScroll: null,
        locate,
        direction: param.direction,
        scrollType: param.scrollType,
        distance: param.distance,
      });
    } else if (type === 'Sleep') {
      const param = plan.param as PlanningActionParamSleep;
      flow.push({
        sleep: param.timeMs,
      });
    } else if (
      type === 'AndroidBackButton' ||
      type === 'AndroidHomeButton' ||
      type === 'AndroidRecentAppsButton'
    ) {
      // not implemented in yaml yet
    } else if (
      type === 'Error' ||
      type === 'ExpectedFalsyCondition' ||
      type === 'Assert' ||
      type === 'AssertWithoutThrow' ||
      type === 'Finished'
    ) {
      // do nothing
    } else {
      console.warn(
        `Cannot convert action ${type} to yaml flow. This should be a bug of Midscene.`,
      );
    }
  }

  if (sleep) {
    flow.push({
      sleep: sleep,
    });
  }

  return flow;
}
