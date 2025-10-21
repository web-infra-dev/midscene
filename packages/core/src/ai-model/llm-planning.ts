import type {
  DeviceAction,
  InterfaceType,
  PlanningAIResponse,
  RawResponsePlanningAIResponse,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import {
  AIActionType,
  buildYamlFlowFromPlans,
  fillBboxParam,
  findAllMidsceneLocatorField,
} from './common';
import type { ConversationHistory } from './conversation-history';
import { systemPromptToTaskPlanning } from './prompt/llm-planning';
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

  const { vlMode } = modelConfig;

  // Planning requires VL mode (validated by ModelConfigManager.getModelConfig)
  assert(vlMode, 'Planning requires vlMode to be configured.');

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    vlMode: vlMode,
  });

  let imagePayload = screenshotBase64;
  let imageWidth = size.width;
  let imageHeight = size.height;
  const rightLimit = imageWidth;
  const bottomLimit = imageHeight;

  // Process image based on VL mode requirements
  if (vlMode === 'qwen-vl') {
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  }

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
        // Planning uses pure vision mode, no DOM description needed
      ],
    },
  ];

  const { content: planFromAI, usage } =
    await callAIWithObjectResponse<RawResponsePlanningAIResponse>(
      msgs,
      AIActionType.PLAN,
      modelConfig,
    );
  const rawResponse = JSON.stringify(planFromAI, undefined, 2);

  const actions = planFromAI.action ? [planFromAI.action] : [];
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
        // Always use VL mode to fill bbox parameters
        action.param[field] = fillBboxParam(
          locateResult,
          imageWidth,
          imageHeight,
          rightLimit,
          bottomLimit,
          vlMode,
        );
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
