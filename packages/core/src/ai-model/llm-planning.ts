import type {
  DeepThinkOption,
  DeviceAction,
  InterfaceType,
  PlanningAIResponse,
  RawResponsePlanningAIResponse,
  SubGoal,
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
  AIResponseParseError,
  callAI,
  safeParseJson,
} from './service-caller/index';

const debug = getDebug('planning');
const warnLog = getDebug('planning', { console: true });

/**
 * Build the JSON Schema for the planning response format.
 * Used with OpenAI's response_format: { type: "json_schema" }
 */
export function buildPlanningResponseSchema(includeSubGoals: boolean): {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
} {
  const properties: Record<string, unknown> = {
    thought: {
      type: 'string',
      description: 'Your thought process about the current state and next action',
    },
    log: {
      type: ['string', 'null'],
      description: 'A brief preamble message to the user explaining what you are about to do',
    },
    error: {
      type: ['string', 'null'],
      description: 'Error message if there is an error',
    },
    action_type: {
      type: ['string', 'null'],
      description: 'The action type to execute, must be one of the supporting actions',
    },
    action_param: {
      description: 'The parameters for the action',
      anyOf: [{ type: 'object' }, { type: 'null' }],
    },
    complete: {
      description: 'Set when the task is completed or failed',
      anyOf: [
        {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the task was completed successfully',
            },
            message: {
              type: 'string',
              description: 'Message to provide to the user',
            },
          },
          required: ['success', 'message'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  };

  const required = ['thought', 'log', 'error', 'action_type', 'action_param', 'complete'];

  if (includeSubGoals) {
    properties.update_sub_goals = {
      description: 'Sub-goals to create or update',
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer', description: 'Sub-goal index (1-based)' },
              status: {
                type: 'string',
                enum: ['pending', 'finished'],
                description: 'Status of the sub-goal',
              },
              description: { type: 'string', description: 'Description of the sub-goal' },
            },
            required: ['index', 'status', 'description'],
            additionalProperties: false,
          },
        },
        { type: 'null' },
      ],
    };
    properties.mark_finished_indexes = {
      description: 'Indexes of sub-goals to mark as finished',
      anyOf: [
        {
          type: 'array',
          items: { type: 'integer' },
        },
        { type: 'null' },
      ],
    };
    properties.memory = {
      type: ['string', 'null'],
      description: 'Information to remember from the current screenshot for future steps',
    };
    required.push('update_sub_goals', 'mark_finished_indexes', 'memory');
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: 'planning_response',
      strict: false,
      schema: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

/**
 * Parse JSON response from LLM and convert to RawResponsePlanningAIResponse
 */
export function parseJSONPlanningResponse(
  jsonString: string,
  modelFamily: TModelFamily | undefined,
): RawResponsePlanningAIResponse {
  let parsed: any;
  try {
    parsed = safeParseJson(jsonString, modelFamily);
  } catch (e) {
    throw new Error(`Failed to parse planning JSON response: ${e}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Planning response is not a valid JSON object');
  }

  const thought = parsed.thought || undefined;
  const memory = parsed.memory || undefined;
  const log = parsed.log || '';
  const error = parsed.error || undefined;

  // Parse complete field
  let finalizeMessage: string | undefined;
  let finalizeSuccess: boolean | undefined;
  if (parsed.complete && typeof parsed.complete === 'object') {
    finalizeSuccess = parsed.complete.success === true || parsed.complete.success === 'true'
      ? true
      : parsed.complete.success === false || parsed.complete.success === 'false'
        ? false
        : undefined;
    finalizeMessage = parsed.complete.message?.trim() || undefined;
  }

  // Parse sub-goal related fields
  const updateSubGoals: SubGoal[] | undefined = parsed.update_sub_goals?.length
    ? parsed.update_sub_goals.map((sg: any) => ({
        index: sg.index,
        status: sg.status as 'pending' | 'finished',
        description: sg.description,
      }))
    : undefined;

  const markFinishedIndexes: number[] | undefined = parsed.mark_finished_indexes?.length
    ? parsed.mark_finished_indexes
    : undefined;

  // Parse action
  let action: any = null;
  if (parsed.action_type && parsed.action_type !== 'null') {
    const type = String(parsed.action_type).trim();
    action = {
      type,
      ...(parsed.action_param != null ? { param: parsed.action_param } : {}),
    };
  }

  return {
    ...(thought ? { thought } : {}),
    ...(memory ? { memory } : {}),
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
  const { shotSize } = context;
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
  let imageWidth = shotSize.width;
  let imageHeight = shotSize.height;
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

  // Build sub-goal status text to include in the message
  // In deepThink mode: show full sub-goals with logs
  // In non-deepThink mode: show historical execution logs
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

  // Build JSON schema for response format
  // Some model families (doubao-seed, doubao-vision, qwen2.5-vl, glm-v, auto-glm) don't support json_schema response format
  const modelFamiliesWithoutJsonSchema: (string | undefined)[] = [
    'doubao-seed',
    'doubao-vision',
    'qwen2.5-vl',
    'glm-v',
    'auto-glm',
  ];
  const supportsJsonSchema = !modelFamiliesWithoutJsonSchema.includes(modelFamily);
  const responseFormat = supportsJsonSchema
    ? buildPlanningResponseSchema(includeSubGoals)
    : undefined;

  let {
    content: rawResponse,
    usage,
    reasoning_content,
  } = await callAI(msgs, modelConfig, {
    deepThink: opts.deepThink === 'unset' ? undefined : opts.deepThink,
    response_format: responseFormat,
  });

  // Parse JSON response, retry once on parse failure
  let planFromAI: RawResponsePlanningAIResponse;
  try {
    try {
      planFromAI = parseJSONPlanningResponse(rawResponse, modelFamily);
    } catch {
      const retry = await callAI(msgs, modelConfig, {
        deepThink: opts.deepThink === 'unset' ? undefined : opts.deepThink,
        response_format: responseFormat,
      });
      rawResponse = retry.content;
      usage = retry.usage;
      reasoning_content = retry.reasoning_content;
      planFromAI = parseJSONPlanningResponse(rawResponse, modelFamily);
    }

    if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
      warnLog(
        'Planning response included both an action and "complete"; ignoring "complete" output.',
      );
      planFromAI.finalizeMessage = undefined;
      planFromAI.finalizeSuccess = undefined;
    }

    const actions = planFromAI.action ? [planFromAI.action] : [];
    let shouldContinuePlanning = true;

    // Check if task is completed via "complete" field
    if (planFromAI.finalizeSuccess !== undefined) {
      debug('task completed via "complete" field, stop planning');
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
            modelFamily,
          );
        }
      });
    });

    // Update sub-goals in conversation history based on response (only when deepThink is enabled)
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
      // In non-deepThink mode, accumulate logs as historical execution steps
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
      `JSON parse error: ${errorMessage}`,
      rawResponse,
      usage,
    );
  }
}
