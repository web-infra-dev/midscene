import { getTemperatureWithSemanticRetry } from './temperature-with-semantic-retry';
import type {
  ChatCompletionAdapter,
  ChatCompletionCallContext,
  ExtractContentAndReasoning,
  MidsceneChatCompletionDefaults,
  ModelAdapterDefinition,
} from './types';

const defaultChatCompletionParams = ({
  midsceneDefaults,
  userConfig,
}: ChatCompletionCallContext) => ({
  config: {
    temperature: userConfig.temperature ?? midsceneDefaults.temperature,
  },
});

const midsceneChatCompletionDefaults: MidsceneChatCompletionDefaults = {
  temperature: 0,
};

function createDefaultExtractContentAndReasoning(
  reasoningContentKeys: string[],
): ExtractContentAndReasoning {
  return (message) => {
    if (!message) {
      return {
        content: '',
        reasoning_content: '',
      };
    }

    const messageRecord = message as Record<string, unknown>;
    const rawReasoning = reasoningContentKeys
      .map((key) => messageRecord[key])
      .find((value) => typeof value === 'string');
    const messageReasoning =
      typeof rawReasoning === 'string' ? rawReasoning : '';

    return {
      content: typeof message.content === 'string' ? message.content : '',
      reasoning_content: messageReasoning,
    };
  };
}

function resolveExtractContentAndReasoning(
  chatCompletion: ModelAdapterDefinition['chatCompletion'],
): ExtractContentAndReasoning {
  const messageExtraction = chatCompletion?.messageExtraction;
  if (messageExtraction?.kind === 'custom') {
    return messageExtraction.extractContentAndReasoning;
  }

  return createDefaultExtractContentAndReasoning(
    messageExtraction?.reasoningContentKeys ?? ['reasoning_content'],
  );
}

export function resolveChatCompletion(
  chatCompletion: ModelAdapterDefinition['chatCompletion'],
): ChatCompletionAdapter {
  const buildChatCompletionParams =
    chatCompletion?.buildChatCompletionParams ?? defaultChatCompletionParams;
  const unsupportedUserConfig = chatCompletion?.unsupportedUserConfig ?? [];
  const extractContentAndReasoning =
    resolveExtractContentAndReasoning(chatCompletion);
  const useReasoningAsContentFallback =
    chatCompletion?.useReasoningAsContentFallback ?? false;
  const replayRawAssistantMessage =
    chatCompletion?.replayRawAssistantMessage ?? false;

  return {
    unsupportedUserConfig,
    buildChatCompletionParams: (input) => {
      const context = {
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneChatCompletionDefaults,
      };
      const params = buildChatCompletionParams(context);
      return {
        ...params,
        config: {
          ...params.config,
          temperature: getTemperatureWithSemanticRetry({
            temperature: params.config.temperature,
            userTemperature: input.userConfig?.temperature,
            semanticRetryAttempt: input.semanticRetryAttempt,
          }),
        },
      };
    },
    extractContentAndReasoning,
    useReasoningAsContentFallback,
    replayRawAssistantMessage,
  };
}
