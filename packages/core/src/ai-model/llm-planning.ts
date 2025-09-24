import type {
  DeviceAction,
  InterfaceType,
  PlanningAIResponse,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/index';
import {
  AIActionType,
  buildYamlFlowFromPlans,
  fillBboxParam,
  findAllMidsceneLocatorField,
  markupImageForLLM,
  warnGPT4oSizeLimit,
} from './common';
import type { ConversationHistory } from './conversation-history';
import { systemPromptToTaskPlanning } from './prompt/llm-planning';
import { describeUserPage } from './prompt/util';
import { callAIWithObjectResponse } from './service-caller/index';

const debug = getDebug('planning');

export async function plan(
  userInstruction: string,
  opts: {
    context: UIContext;
    interfaceType: InterfaceType;
    actionSpace: DeviceAction<any>[];
    actionContext?: string;
    modelConfig: IModelConfig;
    conversationHistory?: ConversationHistory;
  },
): Promise<PlanningAIResponse> {
  const { context, modelConfig, conversationHistory } = opts;
  const { screenshotBase64, size } = context;

  const { modelName, vlMode } = modelConfig;

  const { description: pageDescription, elementById } = await describeUserPage(
    context,
    { vlMode },
  );
  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    vlMode: vlMode,
  });

  let imagePayload = screenshotBase64;
  let imageWidth = size.width;
  let imageHeight = size.height;
  const rightLimit = imageWidth;
  const bottomLimit = imageHeight;
  if (vlMode === 'qwen-vl') {
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  } else if (vlMode === 'qwen3-vl') {
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload, 32);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  } else if (!vlMode) {
    imagePayload = await markupImageForLLM(screenshotBase64, context.tree, {
      width: imageWidth,
      height: imageHeight,
    });
  }

  warnGPT4oSizeLimit(size, modelName);

  const historyLog = opts.conversationHistory?.snapshot() || [];
  // .filter((item) => item.role === 'assistant') || [];

  const knowledgeContext: ChatCompletionMessageParam[] = opts.actionContext
    ? [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `<high_priority_knowledge>${opts.actionContext}</high_priority_knowledge>`,
            },
          ],
        },
      ]
    : [];

  const instruction: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<user_instruction>${userInstruction}</user_instruction>`,
        },
      ],
    },
  ];

  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...knowledgeContext,
    ...instruction,
    ...historyLog,
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
        ...(vlMode
          ? []
          : ([
              {
                type: 'text',
                text: pageDescription,
              },
            ] as ChatCompletionContentPart[])),
      ],
    },
  ];

  const { content, usage } = await callAIWithObjectResponse<PlanningAIResponse>(
    msgs,
    AIActionType.PLAN,
    modelConfig,
  );
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

    debug('actionInActionSpace matched', actionInActionSpace);
    const locateFields = actionInActionSpace
      ? findAllMidsceneLocatorField(actionInActionSpace.paramSchema)
      : [];

    debug('locateFields', locateFields);

    locateFields.forEach((field) => {
      const locateResult = action.param[field];
      if (locateResult) {
        if (vlMode) {
          action.param[field] = fillBboxParam(
            locateResult,
            imageWidth,
            imageHeight,
            rightLimit,
            bottomLimit,
            vlMode,
          );
        } else {
          const element = elementById(locateResult);
          if (element) {
            action.param[field].id = element.id;
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

  conversationHistory?.append({
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: rawResponse,
      },
    ],
  });
  conversationHistory?.append({
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'I have finished the action previously planned',
      },
    ],
  });

  return returnValue;
}
