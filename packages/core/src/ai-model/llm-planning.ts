import type {
  DeepThinkOption,
  DeviceAction,
  InterfaceType,
  PlanningAIResponse,
  PlanningAction,
  RawResponsePlanningAIResponse,
  UIContext,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { paddingToMatchBlockByBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import {
  buildYamlFlowFromPlans,
  fillBboxParam,
  findAllMidsceneLocatorField,
} from '../common';
import type { ConversationHistory } from './conversation-history';
import {
  convertActionSpaceToTools,
  systemPromptForFunctionCalling,
  systemPromptToTaskPlanning,
} from './prompt/llm-planning';
import { callAI, callAIWithObjectResponse } from './service-caller/index';

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
    deepThink?: DeepThinkOption;
    useFunctionCalling?: boolean;
  },
): Promise<PlanningAIResponse> {
  // Use function calling mode if enabled
  if (opts.useFunctionCalling) {
    return planWithFunctionCalling(userInstruction, opts);
  }

  // Original implementation (legacy JSON schema mode)
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
    reasoning_content,
  } = await callAIWithObjectResponse<RawResponsePlanningAIResponse>(
    msgs,
    modelConfig,
    {
      deepThink: opts.deepThink === 'unset' ? undefined : opts.deepThink,
    },
  );

  const actions = planFromAI.action ? [planFromAI.action] : [];
  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    actions,
    rawResponse,
    usage,
    reasoning_content,
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

/**
 * Plan using function calling mode
 * This version uses OpenAI's function calling feature instead of JSON schema responses
 */
async function planWithFunctionCalling(
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
    deepThink?: DeepThinkOption;
  },
): Promise<PlanningAIResponse> {
  const { context, modelConfig, conversationHistory } = opts;
  const { screenshotBase64, size } = context;

  const { vlMode } = modelConfig;

  // Get system prompt for function calling mode
  const systemPrompt = await systemPromptForFunctionCalling();

  // Convert actionSpace to OpenAI tools
  const tools = convertActionSpaceToTools(opts.actionSpace);

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

  // Call AI with tools
  const {
    content: logMessage,
    tool_calls,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig, {
    deepThink: opts.deepThink === 'unset' ? undefined : opts.deepThink,
    tools,
    tool_choice: 'auto', // Let the model decide whether to call a tool
  });

  debug('AI response - log:', logMessage);
  debug('AI response - tool_calls:', JSON.stringify(tool_calls));

  // Convert tool_calls to PlanningAction format
  let actions: PlanningAction[] = [];
  let more_actions_needed = false;
  let error: string | undefined;

  if (tool_calls && tool_calls.length > 0) {
    // Process the first tool call (we only expect one action at a time)
    const toolCall = tool_calls[0];

    // Type guard: check if this is a function tool call
    if (toolCall.type === 'function' && 'function' in toolCall) {
      const actionName = toolCall.function.name;

      try {
        const argumentsStr = toolCall.function.arguments;
        const param = JSON.parse(argumentsStr);

        actions = [
          {
            type: actionName,
            param,
          },
        ];

        // Process bbox parameters if needed
        const actionInActionSpace = opts.actionSpace.find(
          (action) => action.name === actionName,
        );

        if (actionInActionSpace) {
          const locateFields = findAllMidsceneLocatorField(
            actionInActionSpace.paramSchema,
          );

          locateFields.forEach((field) => {
            const locateResult = param[field];
            if (locateResult && vlMode !== undefined) {
              param[field] = fillBboxParam(
                locateResult,
                imageWidth,
                imageHeight,
                rightLimit,
                bottomLimit,
                vlMode,
              );
            }
          });
        }

        // Assume more actions might be needed (this could be enhanced)
        more_actions_needed = true;
      } catch (e) {
        error = `Failed to parse tool call arguments: ${e}`;
        debug('Error parsing tool call:', e);
      }
    }
  } else {
    // No tool calls - task might be complete or model is waiting
    more_actions_needed = false;
  }

  const returnValue: PlanningAIResponse = {
    log: logMessage,
    more_actions_needed_by_instruction: more_actions_needed,
    actions,
    usage,
    rawResponse: logMessage,
    reasoning_content,
    error,
    yamlFlow: buildYamlFlowFromPlans(actions, opts.actionSpace, undefined),
  };

  // Add assistant message to conversation history
  // Include both the text response and tool calls
  const assistantMessage: ChatCompletionMessageParam = {
    role: 'assistant',
    content: logMessage || null,
  };

  if (tool_calls && tool_calls.length > 0) {
    (assistantMessage as any).tool_calls = tool_calls;
  }

  conversationHistory.append(assistantMessage);

  return returnValue;
}

/**
 * Create a tool response message with screenshot for function calling mode
 * This should be called after executing an action to provide feedback to the LLM
 *
 * @param toolCallId - The ID of the tool call being responded to
 * @param toolName - The name of the tool that was called
 * @param result - The result of the tool execution
 * @param screenshotBase64 - The screenshot after the action was executed
 * @returns An array of ChatCompletionMessageParam for the tool response and screenshot
 */
export function createToolResponseWithScreenshot(
  toolCallId: string,
  toolName: string,
  result: { success: boolean; message?: string; error?: string },
  screenshotBase64: string,
): ChatCompletionMessageParam[] {
  // Return both the tool response and a user message with the screenshot
  return [
    {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify(result),
    } as any,
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: result.error
            ? `The action "${toolName}" failed: ${result.error}. Here is the current screenshot.`
            : `The action "${toolName}" was executed. Here is the updated screenshot.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
            detail: 'high',
          },
        },
      ],
    },
  ];
}
