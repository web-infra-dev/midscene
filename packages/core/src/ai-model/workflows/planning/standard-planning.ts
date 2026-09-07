import type {
  PlanningAIResponse,
  PlanningAction,
  RawResponsePlanningAIResponse,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { buildYamlFlowFromPlans } from '../../../common';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import { buildStandardPlanningSystemPrompt } from '../../prompt/planning';
import { AIResponseParseError, callAI } from '../../service-caller/index';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from '../../service-caller/semantic-retry';
import type {
  LocateResultCodec,
  LocateResultContext,
} from '../../shared/model-locate-result';
import { planningModelFamilyRequiredForLocateMessage } from '../../shared/model-locate-result/errors';
import {
  type PreparedUserPrompt,
  preparedReferenceImagesToChatMessages,
} from '../../shared/multimodal-prompt';
import { normalizePlanningActionLocateFields } from './locate-normalization';
import { parseStandardPlanningResponse } from './standard-planning-parser';
import type { PlanOptions } from './types';

const debug = getDebug('planning');
const warnLog = getDebug('planning', { console: true });

const noPreviousActionsText =
  'No previous actions have been executed in this aiAct execution yet. If the instruction asks for actions, choose the first action to execute.';
type PlanningCallResponse = Awaited<ReturnType<typeof callAI>>;

type CallAndParsePlanningResponseOptions = {
  messages: ChatCompletionMessageParam[];
  modelRuntime: PlanOptions['modelRuntime'];
  abortSignal?: AbortSignal;
  includeLocateInPlanning: boolean;
  actionSpace: PlanOptions['actionSpace'];
  locateResultCodec?: LocateResultCodec;
  locateResultContext: LocateResultContext;
  includeThought: boolean;
  includeLog: boolean;
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
    locateResultCodec,
    locateResultContext,
    includeThought,
    includeLog,
  } = options;
  assert(
    modelRuntime.adapter.planning.kind === 'standard',
    'callAndParsePlanningResponse requires a standard planning adapter',
  );
  const actionOutputProtocol =
    modelRuntime.adapter.planning.protocol.actionOutputProtocol;

  return callAiAndParseWithRetry({
    callAi: (retryAttempt, previousParseError) =>
      callAI(
        withSemanticRetryFeedback(messages, previousParseError),
        modelRuntime,
        {
          abortSignal,
          requiresOriginalImageDetail: includeLocateInPlanning,
          semanticRetryAttempt: retryAttempt,
        },
      ),
    parseResponse: (response) => {
      const planFromAI = parseStandardPlanningResponse(response.content, {
        includeThought,
        actionOutputProtocol,
        actionSpace,
        logSource: includeLog ? 'model' : 'action',
      });
      if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
        warnLog(
          'Planning response included both an action and <complete>; ignoring <complete> output.',
        );
        planFromAI.finalizeMessage = undefined;
        planFromAI.finalizeSuccess = undefined;
      }

      const actions = planFromAI.action ? [planFromAI.action] : [];
      normalizePlanningActionLocateFields(actions, {
        actionSpace,
        includeLocateInPlanning,
        locateResultCodec,
        locateResultContext,
        acceptBbox2dAlias: modelRuntime.adapter.acceptBbox2dAlias,
        parseRawLocateParameter: actionOutputProtocol.parseRawLocateParameter,
      });
      // dumpActionParam keeps only the locator prompt, so runtime-only
      // locatedPixelBbox fields added during normalization are not serialized.
      const yamlFlow = buildYamlFlowFromPlans(actions, actionSpace);
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

export async function standardPlan(
  userInstruction: PreparedUserPrompt,
  opts: PlanOptions,
): Promise<PlanningAIResponse> {
  const { context, conversationHistory } = opts;
  const modelRuntime = opts.modelRuntime;
  const { adapter } = modelRuntime;
  const { shotSize } = context;
  const screenshotBase64 = context.screenshot.base64;
  assert(
    adapter.planning.kind === 'standard',
    'standardPlan requires a standard planning adapter',
  );
  const planningProtocol = adapter.planning.protocol;

  if (opts.includeLocateInPlanning && !modelRuntime.config.modelFamily) {
    throw new Error(
      planningModelFamilyRequiredForLocateMessage(modelRuntime.config.slot),
    );
  }

  const locateResultCodec = modelRuntime.config.modelFamily
    ? adapter.planning.locateResultCodec
    : undefined;

  // Only enable sub-goals when aiAct is in deep-thinking planning mode.
  const includeSubGoals = opts.effort === 'deepThink';
  const includeThought = opts.effort !== 'fast';
  const includeLog = opts.effort !== 'fast';

  if (opts.includeLocateInPlanning && !locateResultCodec) {
    throw new Error(
      planningModelFamilyRequiredForLocateMessage(modelRuntime.config.slot),
    );
  }

  const systemPrompt = await buildStandardPlanningSystemPrompt({
    actionSpace: opts.actionSpace,
    includeThought,
    includeLog,
    includeSubGoals,
    planningProtocol,
    ...(opts.includeLocateInPlanning && locateResultCodec
      ? {
          includeLocateInPlanning: true,
          locatePromptSpec: locateResultCodec.promptSpec,
        }
      : { includeLocateInPlanning: false }),
  });

  const preparedImage = await prepareModelImage({
    imageBase64: screenshotBase64,
    width: shotSize.width,
    height: shotSize.height,
    policy: adapter.imagePreprocess,
  });
  const imagePayload = preparedImage.imageBase64;

  const actionContext = opts.actionContext ? `${opts.actionContext}\n` : '';

  const referenceImageMessages = preparedReferenceImagesToChatMessages(
    userInstruction.referenceImages,
  );
  const instruction: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${actionContext}<user_instruction>${userInstruction.text}</user_instruction>`,
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
    locateResultCodec,
    locateResultContext: {
      preparedSize: preparedImage.preparedSize,
      contentSize: preparedImage.contentSize,
    },
    includeThought,
    includeLog,
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

  // TODO: The plan log is recorded before its action has executed, so a failed
  // action may still appear in the next round as an action already performed.
  // Move this write to the successful action execution path in TaskExecutor.action.
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
