import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildClaudeChatCompletionParams = ({
  userConfig,
}: ChatCompletionCallContext): ChatCompletionParamsResult => ({
  config:
    userConfig.temperature === undefined
      ? {}
      : { temperature: userConfig.temperature },
});

export const claudeAdapters = {
  claude: {
    supportedProtocols: ['openai-chat'],
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: buildClaudeChatCompletionParams,
      useReasoningAsContentFallback: true,
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'claude'>;
