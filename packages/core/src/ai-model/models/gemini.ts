import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionCallContext,
  ChatCompletionContentSource,
  ChatCompletionParamsResult,
  ContentAndReasoning,
  ModelAdapterDefinition,
} from '../model-adapter/types';

const buildGeminiChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig } = input;
  const { reasoningEnabled, reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const modelSpecificConfig: {
    extra_body?: {
      google?: {
        thinking_config: {
          include_thoughts: true;
          thinking_level: string;
        };
      };
    };
  } = {};

  if (reasoningEnabled !== 'default') {
    // Google documents OpenAI reasoning_effort mapping, but live tests on Gemini 4
    // rejected minimal instead of mapping it to low, so we keep Google's native config.
    // Minimum thinking levels vary by model; low is supported by most Gemini 3/4 models.
    modelSpecificConfig.extra_body = {
      google: {
        thinking_config: {
          include_thoughts: true,
          thinking_level: reasoningEnabled
            ? (reasoningEffort ?? 'medium')
            : 'low',
        },
      },
    };
  }

  return {
    config: {
      ...midsceneDefaults,
      ...commonOverrideConfig,
      ...modelSpecificConfig,
    },
  };
};

const extractInlineThought = (content: string): string | undefined => {
  const match = content.match(/^<thought>([\s\S]*?)<\/thought>/i);
  return match?.[1]?.trim() || undefined;
};

function formatReasoningContent({
  geminiReasoningContent,
  providerReasoningContent,
}: {
  geminiReasoningContent: string;
  providerReasoningContent: string;
}): string {
  if (geminiReasoningContent && providerReasoningContent) {
    return `inlineThought：${geminiReasoningContent}; reasoning_content：${providerReasoningContent}`;
  }

  return geminiReasoningContent || providerReasoningContent || '';
}

export const extractGeminiContentAndReasoning = (
  message: ChatCompletionContentSource | undefined,
): ContentAndReasoning => {
  if (!message) {
    return {
      content: '',
      reasoning_content: '',
    };
  }

  const content = typeof message.content === 'string' ? message.content : '';
  // Live tests with `include_thoughts` showed Google's endpoint prepending
  // summaries as `<thought>...</thought>` in content, while some relays
  // returned no reasoning. Extract the prefix without changing content.
  const geminiReasoningContent = extractInlineThought(content) || '';

  return {
    content,
    reasoning_content: formatReasoningContent({
      geminiReasoningContent,
      providerReasoningContent:
        typeof message.reasoning_content === 'string'
          ? message.reasoning_content
          : '',
    }),
  };
};

export const geminiAdapters = {
  gemini: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningBudget'],
      buildChatCompletionParams: buildGeminiChatCompletionParams,
      messageExtraction: {
        kind: 'custom',
        extractContentAndReasoning: extractGeminiContentAndReasoning,
      },
    },
    locate: {
      element: {
        resultFormat: {
          coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
        },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gemini'>;
