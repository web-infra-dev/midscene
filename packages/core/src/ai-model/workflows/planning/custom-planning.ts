import type { PlanningAIResponse, PlanningAction } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { ScreenshotItem } from '../../../screenshot-item';
import type {
  CustomPlanningInput,
  CustomPlanningMessageConfig,
  ResolvedCustomPlanningDefinition,
} from '../../model-adapter/custom-planning-types';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
import {
  AIResponseParseError,
  callAIWithStringResponse,
} from '../../service-caller/index';
import {
  type PreparedUserPrompt,
  preparedReferenceImagesToChatMessages,
} from '../../shared/multimodal-prompt';
import { normalizePlanningActionLocateFields } from './locate-normalization';
import type { PlanOptions } from './types';

function appendActionContext(
  systemPrompt: string,
  actionContext?: string,
): string {
  return systemPrompt + (actionContext ? `${actionContext}\n` : '');
}

export function buildCustomPlanningMessages<TParsed>(
  input: CustomPlanningInput,
  config: CustomPlanningMessageConfig<TParsed>,
): ChatCompletionMessageParam[] {
  const { options } = input;
  const { conversationHistory, context, actionContext } = options;
  const systemPrompt = appendActionContext(
    config.buildSystemPrompt(),
    actionContext,
  );
  const userInstructionText = input.userInstruction.text;
  const userInstruction = config.buildUserInstruction
    ? config.buildUserInstruction(userInstructionText)
    : userInstructionText;
  const referenceImageMessages = preparedReferenceImagesToChatMessages(
    input.userInstruction.referenceImages,
  );

  if (conversationHistory.pendingFeedbackMessage) {
    conversationHistory.append({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${conversationHistory.pendingFeedbackMessage}. The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.`,
        },
      ],
    });
    conversationHistory.resetPendingFeedbackMessageIfExists();
  }

  conversationHistory.append({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: { url: context.screenshot.base64 },
      },
    ],
  });

  if (config.systemPromptPlacement === 'system-message') {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [{ type: 'text', text: userInstruction }],
      },
      ...referenceImageMessages,
      ...conversationHistory.snapshot(config.historyImageLimit),
    ];
  }

  return [
    {
      role: 'user',
      content: `${systemPrompt}${userInstruction}`,
    },
    ...referenceImageMessages,
    ...conversationHistory.snapshot(config.historyImageLimit),
  ];
}

export async function runCustomPlanning<TParsed>(
  userInstruction: PreparedUserPrompt,
  options: PlanOptions,
  config: ResolvedCustomPlanningDefinition<TParsed>,
): Promise<PlanningAIResponse> {
  const { context } = options;
  const preparedImage = await prepareModelImage({
    imageBase64: context.screenshot.base64,
    width: context.shotSize.width,
    height: context.shotSize.height,
    policy: options.modelRuntime.adapter.imagePreprocess,
  });
  const preparedOptions: PlanOptions = {
    ...options,
    context: {
      ...context,
      screenshot: ScreenshotItem.create(
        preparedImage.imageBase64,
        context.screenshot.capturedAt,
      ),
      shotSize: preparedImage.preparedSize,
    },
  };
  const input: CustomPlanningInput = {
    userInstruction,
    options: preparedOptions,
    coordinateSystem: config.coordinateSystem,
  };

  const messages = buildCustomPlanningMessages(input, config.messages);
  const { content, usage, rawChoiceMessage } = await callAIWithStringResponse(
    messages,
    preparedOptions.modelRuntime,
    {
      abortSignal: preparedOptions.abortSignal,
      requiresOriginalImageDetail: preparedOptions.includeLocateInPlanning,
    },
  );

  let parsed: TParsed;
  let actions: PlanningAction[];
  let shouldContinuePlanning: boolean;

  try {
    parsed = config.parseResponse(content, input);
    actions = config.transformActions(parsed, input);
    normalizePlanningActionLocateFields(actions, {
      actionSpace: preparedOptions.actionSpace,
      includeLocateInPlanning: preparedOptions.includeLocateInPlanning,
      locateResultCodec: config.coordinateNormalizer,
      locateResultContext: {
        preparedSize: preparedImage.preparedSize,
        contentSize: preparedImage.contentSize,
      },
      acceptBbox2dAlias: preparedOptions.modelRuntime.adapter.acceptBbox2dAlias,
      parseRawLocateParameter: (value) =>
        value as ParsedPlanningLocateParameter,
    });
    shouldContinuePlanning = config.shouldContinuePlanning(parsed, actions);
  } catch (parseError) {
    const errorMessage = `Parse error: ${
      parseError instanceof Error ? parseError.message : String(parseError)
    }`;
    throw new AIResponseParseError(
      errorMessage,
      JSON.stringify(content, undefined, 2),
      usage,
      rawChoiceMessage,
    );
  }

  const assistantContent = config.messages.buildAssistantContent?.(
    parsed,
    content,
    input,
  );
  // UI-TARS and Auto-GLM define their own assistant history format.
  if (assistantContent) {
    options.conversationHistory.append({
      role: 'assistant',
      content: assistantContent,
    });
  }

  return {
    actions,
    log: config.buildResponseLog(parsed, content),
    usage,
    shouldContinuePlanning,
    rawResponse: JSON.stringify(content, undefined, 2),
    rawChoiceMessage,
  };
}
