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
import {
  extractXMLTag,
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from './prompt/util';
import { callAI } from './service-caller/index';
import { safeParseJson } from './service-caller/index';

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
  const log = extractXMLTag(xmlString, 'log') || '';
  const error = extractXMLTag(xmlString, 'error');
  const actionType = extractXMLTag(xmlString, 'action-type');
  const actionParamStr = extractXMLTag(xmlString, 'action-param-json');

  // Parse complete-goal tag with success attribute
  const completeGoalRegex =
    /<complete-goal\s+success="(true|false)">([\s\S]*?)<\/complete-goal>/i;
  const completeGoalMatch = xmlString.match(completeGoalRegex);
  let finalizeMessage: string | undefined;
  let finalizeSuccess: boolean | undefined;

  if (completeGoalMatch) {
    finalizeSuccess = completeGoalMatch[1] === 'true';
    finalizeMessage = completeGoalMatch[2]?.trim() || undefined;
  }

  // Parse sub-goal related tags
  const updatePlanContent = extractXMLTag(xmlString, 'update-plan-content');
  const markSubGoalDone = extractXMLTag(xmlString, 'mark-sub-goal-done');

  const updateSubGoals = updatePlanContent
    ? parseSubGoalsFromXML(updatePlanContent)
    : undefined;
  const markFinishedIndexes = markSubGoalDone
    ? parseMarkFinishedIndexes(markSubGoalDone)
    : undefined;

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
    ...(updateSubGoals?.length ? { updateSubGoals } : {}),
    ...(markFinishedIndexes?.length ? { markFinishedIndexes } : {}),
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

  // Only enable sub-goals when deepThink is true
  const includeSubGoals = opts.deepThink === true;

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    modelFamily,
    includeBbox: opts.includeBbox,
    includeThought: true, // always include thought
    includeSubGoals,
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

  // Build sub-goal status text to include in the message (only when deepThink is enabled)
  const subGoalsText = includeSubGoals
    ? conversationHistory.subGoalsToText()
    : '';
  const subGoalsSection = subGoalsText ? `\n\n${subGoalsText}` : '';

  // Build notes text to include in the message
  const notesText = conversationHistory.notesToText();
  const notesSection = notesText ? `\n\n${notesText}` : '';

  if (conversationHistory.pendingFeedbackMessage) {
    latestFeedbackMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${conversationHistory.pendingFeedbackMessage}. The last screenshot is attached. Please going on according to the instruction.${notesSection}${subGoalsSection}`,
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
          text: `this is the latest screenshot${notesSection}${subGoalsSection}`,
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

  // Compress history if it exceeds the threshold to avoid context overflow
  conversationHistory.compressHistory(50, 20);

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

  // Parse XML response to JSON object
  const planFromAI = parseXMLPlanningResponse(rawResponse, modelFamily);

  if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
    console.warn(
      'Planning response included both an action and complete-goal; ignoring complete-goal output.',
    );
    planFromAI.finalizeMessage = undefined;
    planFromAI.finalizeSuccess = undefined;
  }

  const actions = planFromAI.action ? [planFromAI.action] : [];
  let shouldContinuePlanning = true;

  // Check if goal is completed via complete-goal tag
  if (planFromAI.finalizeSuccess !== undefined) {
    debug('goal completed via complete-goal tag, stop planning');
    shouldContinuePlanning = false;
    // Mark all sub-goals as finished when goal is completed (only when deepThink is enabled)
    if (includeSubGoals) {
      conversationHistory.markAllSubGoalsFinished();
    }
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

  // Update sub-goals in conversation history based on response (only when deepThink is enabled)
  if (includeSubGoals) {
    if (planFromAI.updateSubGoals?.length) {
      conversationHistory.setSubGoals(planFromAI.updateSubGoals);
    }
    if (planFromAI.markFinishedIndexes?.length) {
      for (const index of planFromAI.markFinishedIndexes) {
        conversationHistory.markSubGoalFinished(index);
      }
    }
  }

  // Append note to conversation history if present
  if (planFromAI.note) {
    conversationHistory.appendNote(planFromAI.note);
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
