import type {
  PlanningAIResponse,
  RawResponsePlanningAIResponse,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import {
  buildYamlFlowFromPlans,
  findAllMidsceneLocatorField,
} from '../../../common';
import { getModelAdapter } from '../../models';
import { systemPromptToTaskPlanning } from '../../prompts/llm-planning';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import { prepareModelImage } from '../image-preprocess';
import { normalizePlanningLocateParam } from './locate-param';
import type { PlanOptions } from './types';
import { parseXMLPlanningResponse } from './xml-parser';

const debug = getDebug('planning');
const warnLog = getDebug('planning', { console: true });

export async function plan(
  userInstruction: string,
  opts: PlanOptions,
): Promise<PlanningAIResponse> {
  const { context, modelConfig, conversationHistory } = opts;
  const { shotSize } = context;
  const screenshotBase64 = context.screenshot.base64;

  const { modelFamily } = modelConfig;
  const adapter = getModelAdapter(modelFamily);

  // Only enable sub-goals when aiAct is in deep-thinking planning mode.
  const includeSubGoals = opts.planningModeDeepThink === true;

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    modelFamily,
    includeBbox: opts.includeBbox,
    includeThought: true, // always include thought
    includeSubGoals,
  });

  const preparedImage = await prepareModelImage({
    imageBase64: screenshotBase64,
    width: shotSize.width,
    height: shotSize.height,
    policy: adapter.imagePreprocess,
  });
  const imagePayload = preparedImage.imageBase64;
  const imageWidth = preparedImage.preparedSize.width;
  const imageHeight = preparedImage.preparedSize.height;

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

  // Build sub-goal status text to include in the message
  // In planning deep-think mode: show full sub-goals with logs
  // Otherwise: show historical execution logs
  const subGoalsText = includeSubGoals
    ? conversationHistory.subGoalsToText()
    : conversationHistory.historicalLogsToText();
  const subGoalsSection = subGoalsText ? `\n\n${subGoalsText}` : '';

  // Build memories text to include in the message
  const memoriesText = conversationHistory.memoriesToText();
  const memoriesSection = memoriesText ? `\n\n${memoriesText}` : '';

  if (conversationHistory.pendingFeedbackMessage) {
    latestFeedbackMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${conversationHistory.pendingFeedbackMessage}. The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.${memoriesSection}${subGoalsSection}`,
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
          text: `this is the latest screenshot${memoriesSection}${subGoalsSection}`,
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

  let {
    content: rawResponse,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig, {
    abortSignal: opts.abortSignal,
  });

  // Parse XML response to JSON object, retry once on parse failure
  let planFromAI: RawResponsePlanningAIResponse;
  try {
    try {
      planFromAI = parseXMLPlanningResponse(rawResponse, modelFamily);
    } catch {
      const retry = await callAI(msgs, modelConfig, {
        abortSignal: opts.abortSignal,
      });
      rawResponse = retry.content;
      usage = retry.usage;
      reasoning_content = retry.reasoning_content;
      planFromAI = parseXMLPlanningResponse(rawResponse, modelFamily);
    }

    if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
      warnLog(
        'Planning response included both an action and <complete>; ignoring <complete> output.',
      );
      planFromAI.finalizeMessage = undefined;
      planFromAI.finalizeSuccess = undefined;
    }

    const actions = planFromAI.action ? [planFromAI.action] : [];
    let shouldContinuePlanning = true;

    // Check if task is completed via <complete> tag
    if (planFromAI.finalizeSuccess !== undefined) {
      debug('task completed via <complete> tag, stop planning');
      shouldContinuePlanning = false;
      // Mark all sub-goals as finished when goal is completed in planning deep-think mode.
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
        if (locateResult) {
          action.param[field] = normalizePlanningLocateParam(locateResult, {
            width: imageWidth,
            height: imageHeight,
            bounds: preparedImage.contentSize,
            modelFamily,
          });
        }
      });
    });

    // Update sub-goals in conversation history only in planning deep-think mode.
    if (includeSubGoals) {
      if (planFromAI.updateSubGoals?.length) {
        conversationHistory.mergeSubGoals(planFromAI.updateSubGoals);
      }
      if (planFromAI.markFinishedIndexes?.length) {
        for (const index of planFromAI.markFinishedIndexes) {
          conversationHistory.markSubGoalFinished(index);
        }
      }
      // Append the planning log to the currently running sub-goal
      if (planFromAI.log) {
        conversationHistory.appendSubGoalLog(planFromAI.log);
      }
    } else {
      // Without planning deep-think mode, accumulate logs as historical execution steps.
      if (planFromAI.log) {
        conversationHistory.appendHistoricalLog(planFromAI.log);
      }
    }

    // Append memory to conversation history if present
    if (planFromAI.memory) {
      conversationHistory.appendMemory(planFromAI.memory);
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
}
