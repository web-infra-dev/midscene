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
  includeThought: boolean;
  includeLog: boolean;
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

  // Only enable sub-goals when aiAct is in deep-thinking planning mode.
  const includeSubGoals = opts.effort === 'deepThink';
  const includeThought = opts.effort !== 'fast';
  const includeLog = opts.includeLog ?? true;
  const includeMemory = opts.includeMemory ?? true;
  const includeModelLog = includeLog && opts.effort !== 'fast';

  if (opts.includeLocateInPlanning && !locateResultCodec) {
    throw new Error(
      planningModelFamilyRequiredForLocateMessage(modelRuntime.config.slot),
    );
  }

  const systemPrompt = await buildStandardPlanningSystemPrompt({
    actionSpace: opts.actionSpace,
    includeThought,
    includeLog: includeModelLog,
    includeSubGoals,
    includeMemory,
    includeTaskScope: opts.includeTaskScope,
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
    includeSubGoals ? conversationHistory.subGoalsToText() : '',
    includeLog ? conversationHistory.historicalLogsToText() : '',
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
  const memoriesText = includeMemory
    ? conversationHistory.memoriesToText()
    : '';
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
    includeThought,
    includeLog: includeModelLog,
  });

  if (!includeMemory) {
    planFromAI.memory = undefined;
  }

  // YAML is derived from validated actions outside the model-response retry scope.
  // dumpActionParam omits runtime-only locatedPixelResult fields.
  const yamlFlow = buildYamlFlowFromPlans(actions, opts.actionSpace);

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

  // Model logs are progress preambles, not execution evidence. TaskExecutor
  // records action outcomes after execution, independently of sub-goal updates.
  if (includeSubGoals) {
    if (planFromAI.updateSubGoals?.length) {
      conversationHistory.mergeSubGoals(planFromAI.updateSubGoals);
    }
    if (planFromAI.markFinishedIndexes?.length) {
      for (const index of planFromAI.markFinishedIndexes) {
        conversationHistory.markSubGoalFinished(index);
      }
    }
  }

  // Append memory to conversation history if present
  if (planFromAI.memory) {
    conversationHistory.appendMemory(planFromAI.memory);
  }

  // Keep the original response in the report, but do not replay disabled
  // fields if a model emits them despite their absence from the prompt.
  const disabledTags = [
    ...(!includeMemory ? ['memory'] : []),
    ...(!includeLog ? ['log'] : []),
  ];
  const filterAssistantText = (text: string) => {
    if (!disabledTags.length) return text;
    // Consume action-protocol blocks whole, so literal <memory>/<log> text
    // inside an Input value or locator is not removed from action history.
    const tags = [
      ...planningProtocol.actionOutputProtocol.actionOutputTagNames,
      ...disabledTags,
    ];
    const fields = new RegExp(
      `<(${tags.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
      'gi',
    );
    return text.replace(fields, (field, tag: string) =>
      disabledTags.includes(tag.toLowerCase()) ? '' : field,
    );
  };

  // Preserve provider-specific opaque fields (e.g. thought signatures).
  // Only filter visible content; do not mutate the raw report response.
  if (
    modelRuntime.adapter.chatCompletion.replayRawAssistantMessage &&
    rawChoiceMessage
  ) {
    const message = rawChoiceMessage as ChatCompletionMessageParam;
    conversationHistory.append({
      ...message,
      content:
        typeof message.content === 'string'
          ? filterAssistantText(message.content)
          : Array.isArray(message.content)
            ? message.content.map((part) =>
                part.type === 'text'
                  ? { ...part, text: filterAssistantText(part.text) }
                  : part,
              )
            : message.content,
    } as ChatCompletionMessageParam);
  } else {
    conversationHistory.append({
      role: 'assistant',
      content: [{ type: 'text', text: filterAssistantText(rawResponse) }],
    });
  }

  return returnValue;
}
