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
import { parsePlanningActions } from './parse-planning-actions';
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
};

async function callAndParsePlanningResponse(
  options: CallAndParsePlanningResponseOptions,
): Promise<{
  response: PlanningCallResponse;
  planFromAI: RawResponsePlanningAIResponse;
  actions: PlanningAction[];
}> {
  const {
    messages,
    modelRuntime,
    abortSignal,
    includeLocateInPlanning,
    actionSpace,
    locateResultCodec,
    locateResultContext,
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
        includeThought: true,
        actionOutputProtocol,
        actionSpace,
        logSource: 'model',
      });
      if (
        !planFromAI.action &&
        planFromAI.finalizeSuccess === undefined &&
        !planFromAI.error
      ) {
        throw new Error(
          'Incomplete planning response: provide an action, <complete>, or <error>. A <planning> explanation alone is not sufficient.',
        );
      }
      if (planFromAI.action && planFromAI.finalizeSuccess !== undefined) {
        warnLog(
          'Planning response included both an action and <complete>; ignoring <complete> output.',
        );
        planFromAI.finalizeMessage = undefined;
        planFromAI.finalizeSuccess = undefined;
      }

      const actions = planFromAI.action ? [planFromAI.action] : [];
      parsePlanningActions(actions, {
        parseRawLocateParameter: actionOutputProtocol.parseRawLocateParameter,
        actionSpace,
        includeLocateInPlanning,
        locateResultCodec,
        locateResultContext,
        acceptBbox2dAlias: modelRuntime.adapter.acceptBbox2dAlias,
      });
      return { response, planFromAI, actions };
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

  if (opts.includeLocateInPlanning && !locateResultCodec) {
    throw new Error(
      planningModelFamilyRequiredForLocateMessage(modelRuntime.config.slot),
    );
  }

  const systemPrompt = await buildStandardPlanningSystemPrompt({
    actionSpace: opts.actionSpace,
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

  // Executor records are independent of sub-goals and survive plan updates.
  const executionProgressText = [
    conversationHistory.subGoalsToText(),
    conversationHistory.historicalLogsToText(),
  ]
    .filter(Boolean)
    .join('\n\n');
  const executionProgressSection = executionProgressText
    ? `\n\n${executionProgressText}`
    : conversationHistory.pendingFeedbackMessage ||
        conversationHistory.length > 0
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
          text: `${conversationHistory.pendingFeedbackMessage}. Here is the latest screenshot. Use the execution results and current observation to continue according to the instruction.${memoriesSection}${executionProgressSection}`,
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
  });

  // YAML is derived from validated actions outside the model-response retry scope.
  // dumpActionParam omits runtime-only locatedPixelResult fields.
  const yamlFlow = buildYamlFlowFromPlans(actions, opts.actionSpace);

  let shouldContinuePlanning = true;

  // Check if task is completed via <complete> tag
  if (planFromAI.finalizeSuccess !== undefined) {
    debug('task completed via <complete> tag, stop planning');
    shouldContinuePlanning = false;
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

  // Model logs are progress preambles, not execution evidence. TaskExecutor
  // records action outcomes after execution, independently of sub-goal updates.
  if (planFromAI.updateSubGoals?.length) {
    conversationHistory.mergeSubGoals(planFromAI.updateSubGoals);
  }
  if (planFromAI.markFinishedIndexes?.length) {
    for (const index of planFromAI.markFinishedIndexes) {
      conversationHistory.markSubGoalFinished(index);
    }
  }
  if (planFromAI.finalizeSuccess === true) {
    conversationHistory.markAllSubGoalsFinished();
  }

  // Append memory to conversation history if present
  if (planFromAI.memory) {
    conversationHistory.appendMemory(planFromAI.memory);
  }

  // Preserve provider-specific opaque fields (e.g. thought signatures).
  if (
    modelRuntime.adapter.chatCompletion.replayRawAssistantMessage &&
    rawChoiceMessage
  ) {
    conversationHistory.append(rawChoiceMessage as ChatCompletionMessageParam);
  } else {
    conversationHistory.append({
      role: 'assistant',
      content: [{ type: 'text', text: rawResponse }],
    });
  }

  return returnValue;
}
