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
} from '../common';
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
    conversationHistory: ConversationHistory;
    includeBbox: boolean;
    imagesIncludeCount?: number;
    qwen3_vl_enable_thinking?: boolean;
    doubao_enable_thinking?: 'enabled' | 'disabled' | 'auto';
  },
): Promise<PlanningAIResponse> {
  const { context, modelConfig, conversationHistory } = opts;
  const { screenshotBase64, size } = context;

  const { vlMode } = modelConfig;

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    vlMode,
    includeBbox: opts.includeBbox,
  });

  let imagePayload = screenshotBase64;
  let imageWidth = size.width;
  let imageHeight = size.height;
  const rightLimit = imageWidth;
  const bottomLimit = imageHeight;

  // Process image based on VL mode requirements
  if (vlMode === 'qwen2.5-vl') {
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  }

  const actionContext = opts.actionContext
    ? `<high_priority_knowledge>${opts.actionContext}</high_priority_knowledge>\n`
    : '';

  const instruction: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${actionContext}<user_instruction>${userInstruction}</user_instruction>`,
        },
      ],
    },
  ];

  let latestFeedbackMessage: ChatCompletionMessageParam;

  if (conversationHistory.pendingFeedbackMessage) {
    latestFeedbackMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${conversationHistory.pendingFeedbackMessage}. The last screenshot is attached. Please going on according to the instruction.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: imagePayload,
            detail: 'high',
          },
        },
      ],
    };

    conversationHistory.resetPendingFeedbackMessageIfExists();
  } else {
    latestFeedbackMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'this is the latest screenshot',
        },
        {
          type: 'image_url',
          image_url: {
            url: imagePayload,
            detail: 'high',
          },
        },
      ],
    };
  }
  conversationHistory.append(latestFeedbackMessage);
  const historyLog = conversationHistory.snapshot(opts.imagesIncludeCount);

  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...instruction,
    ...historyLog,
  ];

  const {
    content: planFromAI,
    contentString: rawResponse,
    usage,
  } = await callAIWithObjectResponse<RawResponsePlanningAIResponse>(
    msgs,
    AIActionType.PLAN,
    modelConfig,
    {
      qwen3_vl_enable_thinking: opts.qwen3_vl_enable_thinking,
      doubao_enable_thinking: opts.doubao_enable_thinking,
    },
  );

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
      if (locateResult && vlMode !== undefined) {
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

  conversationHistory.append({
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: rawResponse,
      },
    ],
  });

  return returnValue;
}
