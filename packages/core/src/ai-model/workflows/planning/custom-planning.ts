import type { PlanningAIResponse, PlanningAction } from '@/types';
import { ScreenshotItem } from '../../../screenshot-item';
import type {
  CustomPlanningInput,
  CustomPlanningMessageConfig,
  ResolvedCustomPlanningDefinition,
} from '../../model-adapter/custom-planning-types';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import {
  AIResponseParseError,
  callAIWithStringResponse,
} from '../../service-caller/index';
import type { ModelCallMessages } from '../../service-caller/types';
import {
  type PreparedUserPrompt,
  preparedReferenceImagesToMessages,
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
): ModelCallMessages {
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
  const referenceImageMessages = preparedReferenceImagesToMessages(
    input.userInstruction.referenceImages,
  );

  if (conversationHistory.pendingFeedbackMessage) {
    conversationHistory.appendMessage({
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

  conversationHistory.appendMessage({
    role: 'user',
    content: [
      {
        type: 'image',
        url: context.screenshot.base64,
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
  const { content, usage, rawAssistantOutput } = await callAIWithStringResponse(
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
      rawAssistantOutput,
    );
  }

  const assistantContent = config.messages.buildAssistantContent?.(
    parsed,
    content,
    input,
  );
  // UI-TARS and Auto-GLM define their own assistant history format.
  if (
    rawAssistantOutput?.type === 'responses' &&
    options.modelRuntime.adapter.responses.replayRawAssistantOutput
  ) {
    options.conversationHistory.appendModelOutput(rawAssistantOutput);
  } else if (assistantContent) {
    options.conversationHistory.appendMessage({
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
    rawAssistantOutput,
  };
}
