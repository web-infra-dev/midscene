import type {
  DeepThinkOption,
  DeviceAction,
  InterfaceType,
  PlanningAIResponse,
  RawResponsePlanningAIResponse,
  UIContext,
} from '@/types';
import type { IModelConfig, TModelFamily } from '@midscene/shared/env';
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
import { systemPromptToTaskPlanning } from './prompt/llm-planning';
import { extractXMLTag } from './prompt/util';
import {
  AIResponseParseError,
  callAI,
  safeParseJson,
} from './service-caller/index';

const debug = getDebug('planning');

/**
 * Parse XML response from LLM and convert to RawResponsePlanningAIResponse
 */
export function parseXMLPlanningResponse(
  xmlString: string,
  modelFamily: TModelFamily | undefined,
): RawResponsePlanningAIResponse {
  const thought = extractXMLTag(xmlString, 'thought');
  const note = extractXMLTag(xmlString, 'note');
  const log = extractXMLTag(xmlString, 'log');
  const error = extractXMLTag(xmlString, 'error');
  const actionType = extractXMLTag(xmlString, 'action-type');
  const actionParamStr = extractXMLTag(xmlString, 'action-param-json');

  // Parse complete-task tag with success attribute
  const completeTaskRegex =
    /<complete-task\s+success="(true|false)">([\s\S]*?)<\/complete-task>/i;
  const completeTaskMatch = xmlString.match(completeTaskRegex);
  let finalizeMessage: string | undefined;
  let finalizeSuccess: boolean | undefined;

  if (completeTaskMatch) {
    finalizeSuccess = completeTaskMatch[1] === 'true';
    finalizeMessage = completeTaskMatch[2]?.trim() || undefined;
  }

  // Validate required fields
  if (!log) {
    throw new Error('Missing required field: log');
  }

  // Parse action
  let action: any = null;
  if (actionType && actionType.toLowerCase() !== 'null') {
    const type = actionType.trim();
    let param: any = undefined;

    if (actionParamStr) {
      try {
        // Parse the JSON string in action-param-json
        param = safeParseJson(actionParamStr, modelFamily);
      } catch (e) {
        throw new Error(`Failed to parse action-param-json: ${e}`);
      }
    }

    action = {
      type,
      ...(param !== undefined ? { param } : {}),
    };
  }

  return {
    ...(thought ? { thought } : {}),
    ...(note ? { note } : {}),
    log,
    ...(error ? { error } : {}),
    action,
    ...(finalizeMessage !== undefined ? { finalizeMessage } : {}),
    ...(finalizeSuccess !== undefined ? { finalizeSuccess } : {}),
  };
}

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
  },
): Promise<PlanningAIResponse> {
  const { context, modelConfig, conversationHistory } = opts;
  const { size } = context;
  const screenshotBase64 = context.screenshot.base64;

  const { modelFamily } = modelConfig;

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    modelFamily,
    includeBbox: opts.includeBbox,
    includeThought: true, // always include thought
  });

  let imagePayload = screenshotBase64;
  let imageWidth = size.width;
  let imageHeight = size.height;
  const rightLimit = imageWidth;
  const bottomLimit = imageHeight;

  // Process image based on VL mode requirements
  if (modelFamily === 'qwen2.5-vl') {
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
    content: rawResponse,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig, {
    deepThink: opts.deepThink === 'unset' ? undefined : opts.deepThink,
  });

  // Parse XML response to JSON object, capture parsing errors
  let planFromAI: RawResponsePlanningAIResponse;
  try {
    planFromAI = parseXMLPlanningResponse(rawResponse, modelFamily);
  } catch (parseError) {
    // Throw AIResponseParseError with usage and rawResponse preserved
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new AIResponseParseError(
      `XML parse error: ${errorMessage}`,
      rawResponse,
      usage,
    );
  }

  if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
    console.warn(
      'Planning response included both an action and complete-task; ignoring complete-task output.',
    );
    planFromAI.finalizeMessage = undefined;
    planFromAI.finalizeSuccess = undefined;
  }

  const actions = planFromAI.action ? [planFromAI.action] : [];
  let shouldContinuePlanning = true;

  // Check if task is finalized via complete-task tag
  if (planFromAI.finalizeSuccess !== undefined) {
    debug('task finalized via complete-task tag, stop planning');
    shouldContinuePlanning = false;
  }

  const returnValue: PlanningAIResponse = {
    ...planFromAI,
    actions,
    rawResponse,
    usage,
    reasoning_content,
    yamlFlow: buildYamlFlowFromPlans(actions, opts.actionSpace),
    shouldContinuePlanning,
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
      if (locateResult && modelFamily !== undefined) {
        // Always use model family to fill bbox parameters
        action.param[field] = fillBboxParam(
          locateResult,
          imageWidth,
          imageHeight,
          rightLimit,
          bottomLimit,
          modelFamily,
        );
      }
    });
  });

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
