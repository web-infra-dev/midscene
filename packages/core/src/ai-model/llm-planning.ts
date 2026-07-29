import { type TUserPrompt, userPromptToString } from '@/common';
import type {
  PlanningAIResponse,
  PlanningAction,
  RawResponsePlanningAIResponse,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { buildYamlFlowFromPlans } from '../common';
import { planningModelFamilyRequiredForLocateMessage } from './errors';
import { systemPromptToTaskPlanning } from './prompt/llm-planning';
import {
  extractXMLTag,
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from './prompt/util';
import { AIResponseParseError, callAI } from './service-caller/index';
import type { JsonParser, JsonParserSource } from './service-caller/json';
import { callAiAndParseWithRetry } from './service-caller/semantic-retry';
import type {
  LocateResultAdapter,
  LocateResultContext,
} from './shared/model-locate-result';
import { prepareModelImage } from './workflows/image-preprocess';
import { normalizePlanningActionLocateFields } from './workflows/planning/locate-normalization';
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
  // Use <planning> instead of <thought> to avoid colliding with Gemini thought
  // summaries, which may also be emitted as <thought> in OpenAI-compatible
  // response content.
  const thought = extractXMLTag(xmlString, 'planning');
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

type PlanningCallResponse = Awaited<ReturnType<typeof callAI>>;

type CallAndParsePlanningResponseOptions = {
  messages: ChatCompletionMessageParam[];
  modelRuntime: PlanOptions['modelRuntime'];
  abortSignal?: AbortSignal;
  includeLocateInPlanning: boolean;
  actionSpace: PlanOptions['actionSpace'];
  locateResultAdapter?: LocateResultAdapter;
  locateResultContext: LocateResultContext;
};

async function callAndParsePlanningResponse(
  options: CallAndParsePlanningResponseOptions,
): Promise<{
  response: PlanningCallResponse;
  planFromAI: RawResponsePlanningAIResponse;
  actions: PlanningAction[];
  yamlFlow: ReturnType<typeof buildYamlFlowFromPlans>;
}> {
  const {
    messages,
    modelRuntime,
    abortSignal,
    includeLocateInPlanning,
    actionSpace,
    locateResultAdapter,
    locateResultContext,
  } = options;
  return callAiAndParseWithRetry({
    callAi: () =>
      callAI(messages, modelRuntime, {
        abortSignal,
        requiresOriginalImageDetail: includeLocateInPlanning,
      }),
    parseResponse: (response) => {
      const planFromAI = parseXMLPlanningResponse(
        response.content,
        modelRuntime.adapter.jsonParser,
      );
      if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
        warnLog(
          'Planning response included both an action and <complete>; ignoring <complete> output.',
        );
        planFromAI.finalizeMessage = undefined;
        planFromAI.finalizeSuccess = undefined;
      }

      const actions = planFromAI.action ? [planFromAI.action] : [];
      // Keep yamlFlow based on the model's original action params. Coordinate
      // normalization adds runtime-only locatedPixelBbox fields afterwards.
      const yamlFlow = buildYamlFlowFromPlans(actions, actionSpace);
      normalizePlanningActionLocateFields(actions, {
        actionSpace,
        includeLocateInPlanning,
        locateResultAdapter,
        locateResultContext,
      });
      return { response, planFromAI, actions, yamlFlow };
    },
    toParseError: (parseError, response) => {
      const errorMessage =
        parseError instanceof Error ? parseError.message : String(parseError);
      return new AIResponseParseError(
        `XML parse error: ${errorMessage}`,
        response.content,
        response.usage,
        response.rawChoiceMessage,
        response.reasoning_content,
      );
    },
    parseRetryTimes: modelRuntime.config.retryCount,
    parseRetryInterval: modelRuntime.config.retryInterval,
    abortSignal,
    onParseRetry: (parseError) => {
      debug(
        'retrying plan after response parsing failed: %s',
        parseError instanceof Error ? parseError.message : String(parseError),
      );
    },
  });
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

  const {
    response: {
      content: rawResponse,
      usage,
      reasoning_content,
      rawChoiceMessage,
    },
    planFromAI,
    actions,
    yamlFlow,
  } = await callAndParsePlanningResponse({
    messages: msgs,
    modelRuntime,
    abortSignal: opts.abortSignal,
    includeLocateInPlanning: opts.includeLocateInPlanning,
    actionSpace: opts.actionSpace,
    locateResultAdapter,
    locateResultContext: {
      preparedSize: preparedImage.preparedSize,
      contentSize: preparedImage.contentSize,
    },
  });

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
    rawChoiceMessage,
    usage,
    reasoning_content,
    yamlFlow,
    shouldContinuePlanning,
  };

  assert(planFromAI, "can't get plans from AI");

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

  // Some model providers require opaque assistant fields to be replayed
  // verbatim in later turns. Keep this opt-in per model adapter so that an
  // unverified provider does not receive non-standard response fields.
  if (
    modelRuntime.adapter.chatCompletion.replayRawAssistantMessage &&
    rawChoiceMessage
  ) {
    conversationHistory.append(rawChoiceMessage as ChatCompletionMessageParam);
  } else {
    conversationHistory.append({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: rawResponse,
        },
      ],
    });
  }

  return returnValue;
}
