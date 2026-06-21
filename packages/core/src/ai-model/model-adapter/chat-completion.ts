import type {
  ChatCompletionAdapter,
  ChatCompletionCallContext,
  ChatCompletionContentSource,
  ContentAndReasoning,
  MidsceneChatCompletionDefaults,
  ModelAdapterDefinition,
} from './types';

const defaultImageDetail = (_input: unknown) => undefined;

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

export function defaultExtractContentAndReasoning(
  message: ChatCompletionContentSource | undefined,
): ContentAndReasoning {
  if (!message) {
    return {
      content: '',
      reasoning_content: '',
    };
  }

  const messageReasoning =
    typeof message.reasoning_content === 'string'
      ? message.reasoning_content
      : '';

  return {
    content: typeof message.content === 'string' ? message.content : '',
    reasoning_content: messageReasoning,
  };
}

export function resolveChatCompletion(
  chatCompletion: ModelAdapterDefinition['chatCompletion'],
): ChatCompletionAdapter {
  const buildChatCompletionParams =
    chatCompletion?.buildChatCompletionParams ?? defaultChatCompletionParams;
  const resolveImageDetail =
    chatCompletion?.resolveImageDetail ?? defaultImageDetail;
  const unsupportedUserConfig = chatCompletion?.unsupportedUserConfig ?? [];
  const extractContentAndReasoning =
    chatCompletion?.extractContentAndReasoning ??
    defaultExtractContentAndReasoning;

  return {
    unsupportedUserConfig,
    buildChatCompletionParams: (input) => {
      const context = {
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneChatCompletionDefaults,
      };
      return buildChatCompletionParams(context);
    },
    resolveImageDetail: (input) =>
      resolveImageDetail({
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneChatCompletionDefaults,
      }),
    extractContentAndReasoning,
  };
}
