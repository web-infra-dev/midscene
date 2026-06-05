import { type TUserPrompt, userPromptToString } from '@/common';
import type {
  PlanningAIResponse,
  RawResponsePlanningAIResponse,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { buildYamlFlowFromPlans, findAllMidsceneLocatorField } from '../common';
import { planningModelFamilyRequiredForLocateMessage } from './errors';
import { systemPromptToTaskPlanning } from './prompt/llm-planning';
import {
  extractXMLTag,
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from './prompt/util';
import { AIResponseParseError, callAI } from './service-caller/index';
import type { JsonParser, JsonParserSource } from './service-caller/json';
import { prepareModelImage } from './workflows/image-preprocess';
import type { PlanOptions } from './workflows/planning/types';

const debug = getDebug('planning');
const warnLog = getDebug('planning', { console: true });

const noPreviousActionsText =
  'No previous actions have been executed in this aiAct execution yet. If the instruction asks for actions, choose the first action to execute.';

/**
 * Parse XML response from LLM and convert to RawResponsePlanningAIResponse.
 */
export function parseXMLPlanningResponse(
  xmlString: string,
  jsonParser: JsonParser,
): RawResponsePlanningAIResponse {
  const thought = extractXMLTag(xmlString, 'thought');
  const memory = extractXMLTag(xmlString, 'memory');
  const log = extractXMLTag(xmlString, 'log') || '';
  const error = extractXMLTag(xmlString, 'error');
  const actionType = extractXMLTag(xmlString, 'action-type');
  const actionParamStr = extractXMLTag(xmlString, 'action-param-json');

  // Parse <complete> tag with success attribute
  const completeGoalRegex =
    /<complete\s+success="(true|false)">([\s\S]*?)<\/complete>/i;
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
    // Strip any trailing XML tags that LLM might have leaked into the action type
    // e.g. "KeyboardPress</action-type>\n<action-param-json>" -> "KeyboardPress"
    const type = actionType.split('<')[0].trim();
    let param: any = undefined;

    if (actionParamStr) {
      try {
        // Parse the JSON string in action-param-json
        param = jsonParser(actionParamStr, {
          source: 'planning-action-param',
          preserveStringValueKeys:
            type.toLowerCase() === 'input' ? ['value'] : undefined,
        });
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
  userInstruction: TUserPrompt,
  opts: PlanOptions,
): Promise<PlanningAIResponse> {
  const { context, conversationHistory } = opts;
  const modelRuntime = opts.modelRuntime;
  const { adapter } = modelRuntime;
  const { shotSize } = context;
  const screenshotBase64 = context.screenshot.base64;

  if (opts.includeLocateInPlanning && !modelRuntime.config.modelFamily) {
    throw new Error(
      planningModelFamilyRequiredForLocateMessage(modelRuntime.config.slot),
    );
  }

  const locateResultAdapter =
    modelRuntime.config.modelFamily && adapter.locate.kind === 'standard'
      ? adapter.locate.resultAdapter
      : undefined;

  // Only enable sub-goals when aiAct is in deep-thinking planning mode.
  const includeSubGoals = opts.deepThink === true;

  const systemPrompt = await systemPromptToTaskPlanning({
    actionSpace: opts.actionSpace,
    locatePromptSpec: locateResultAdapter?.promptSpec,
    includeLocateInPlanning: opts.includeLocateInPlanning,
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

  const userInstructionText = userPromptToString(userInstruction);
  const actionContext = opts.actionContext
    ? `<high_priority_knowledge>${opts.actionContext}</high_priority_knowledge>\n`
    : '';

  const referenceImageMessages = opts.referenceImageMessages ?? [];
  const instruction: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${actionContext}<user_instruction>${userInstructionText}</user_instruction>`,
        },
      ],
    },
    ...referenceImageMessages,
  ];

  let latestFeedbackMessage: ChatCompletionMessageParam;

  // Build sub-goal status text to include in the message
  // In planning deep-think mode: show full sub-goals with logs
  // Otherwise: show historical execution logs
  const executionProgressText = includeSubGoals
    ? conversationHistory.subGoalsToText()
    : conversationHistory.historicalLogsToText();
  const executionProgressSection = executionProgressText
    ? `\n\n${executionProgressText}`
    : conversationHistory.pendingFeedbackMessage
      ? ''
      : `\n\n${noPreviousActionsText}`;

  // Build memories text to include in the message
  const memoriesText = conversationHistory.memoriesToText();
  const memoriesSection = memoriesText ? `\n\n${memoriesText}` : '';

  if (conversationHistory.pendingFeedbackMessage) {
    latestFeedbackMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${conversationHistory.pendingFeedbackMessage}. The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.${memoriesSection}${executionProgressSection}`,
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
          text: `This is the current screenshot.${memoriesSection}${executionProgressSection}`,
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
  } = await callAI(msgs, modelRuntime, {
    abortSignal: opts.abortSignal,
    // Planning with locate results is localization-sensitive. Adapters decide
    // whether this should request original image detail.
    requiresOriginalImageDetail: opts.includeLocateInPlanning,
  });

  // Parse XML response to JSON object, retry once on parse failure
  let planFromAI: RawResponsePlanningAIResponse;
  try {
    try {
      planFromAI = parseXMLPlanningResponse(rawResponse, adapter.jsonParser);
    } catch {
      const retry = await callAI(msgs, modelRuntime, {
        abortSignal: opts.abortSignal,
        // Keep retry requests consistent with the initial planning call.
        requiresOriginalImageDetail: opts.includeLocateInPlanning,
      });
      rawResponse = retry.content;
      usage = retry.usage;
      reasoning_content = retry.reasoning_content;
      planFromAI = parseXMLPlanningResponse(rawResponse, adapter.jsonParser);
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
          if (!opts.includeLocateInPlanning) {
            if (typeof locateResult === 'object') {
              // In prompt-only planning mode, ignore any accidental coordinates from the model.
              action.param[field] = { prompt: locateResult.prompt };
            }
            return;
          }

          assert(
            locateResultAdapter,
            'generic planning locate normalization requires a standard locate adapter',
          );
          action.param[field] = {
            ...locateResult,
            locatedPixelBbox: locateResultAdapter.adaptPlanningParamToPixelBbox(
              locateResult,
              {
                preparedSize: preparedImage.preparedSize,
                contentSize: preparedImage.contentSize,
              },
            ),
          };
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
