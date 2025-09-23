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
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import {
  AIActionType,
  type AIArgs,
  buildYamlFlowFromPlans,
  fillBboxParam,
  findAllMidsceneLocatorField,
  markupImageForLLM,
  warnGPT4oSizeLimit,
} from './common';
import type { ConversationHistory } from './conversation-history';
import {
  automationUserPrompt,
  generateTaskBackgroundContext,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
import { describeUserPage } from './prompt/util';
import { callAIWithObjectResponse } from './service-caller/index';

const debug = getDebug('planning');

export async function plan(
  userInstruction: string,
  opts: {
    context: UIContext;
    interfaceType: InterfaceType;
    actionSpace: DeviceAction<any>[];
    log?: string;
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
  const historyLog = getLogFromConversationHistory(
    opts.conversationHistory?.snapshot(),
  );
  const logForContext = historyLog ?? opts.log;
  const taskBackgroundContextText = generateTaskBackgroundContext(
    userInstruction,
    logForContext,
    opts.actionContext,
  );
  const userInstructionPrompt = await automationUserPrompt(vlMode).format({
    pageDescription,
    taskBackgroundContext: taskBackgroundContextText,
  });

  let imagePayload = screenshotBase64;
  if (vlMode === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload);
  } else if (!vlMode) {
    imagePayload = await markupImageForLLM(
      screenshotBase64,
      context.tree,
      context.size,
    );
  }

  warnGPT4oSizeLimit(size, modelName);

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
            size.width,
            size.height,
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
    content: returnValue.log,
  });

  return returnValue;
}

function getLogFromConversationHistory(
  conversationHistory?: ChatCompletionMessageParam[],
): string | undefined {
  if (!conversationHistory?.length) {
    return undefined;
  }

  const assistantMessages = conversationHistory
    .filter((message) => message.role === 'assistant')
    .map((message) => {
      if (typeof message.content === 'string') {
        return message.content.trim();
      }

      if (Array.isArray(message.content)) {
        return message.content
          .map((part) => {
            if (part.type === 'text' && typeof part.text === 'string') {
              return part.text.trim();
            }

            if (typeof (part as any).text === 'string') {
              return (part as any).text.trim();
            }

            return '';
          })
          .filter(Boolean)
          .join('\n');
      }

      return '';
    })
    .map((content) => content.trim())
    .filter(Boolean);

  if (assistantMessages.length === 0) {
    return undefined;
  }

  return `- ${assistantMessages.join('\n- ')}`;
}
