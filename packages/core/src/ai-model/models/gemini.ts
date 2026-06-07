import type { TModelFamily } from '@midscene/shared/env';
import type OpenAI from 'openai';
import { defaultExtractContentAndReasoning } from './chat-content';
import type {
  ChatCompletionCallContext,
  ChatCompletionContentSource,
  ChatCompletionParamsResult,
  ContentAndReasoning,
  ModelAdapterDefinition,
} from './types';

type GeminiContentPart = Record<string, unknown> & {
  text?: string;
  thought?: boolean;
};

type GeminiContentExtension = {
  content: string | null | GeminiContentPart[];
  reasoning_content?: string;
  extra_content?: unknown;
};

type GeminiContentSource =
  | ChatCompletionContentSource
  | (Omit<OpenAI.Chat.Completions.ChatCompletionMessage, 'content'> &
      GeminiContentExtension)
  | (Omit<OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta, 'content'> &
      GeminiContentExtension);

const buildGeminiChatCompletionParams = (
  input: ChatCompletionCallContext,
): ChatCompletionParamsResult => {
  const { midsceneDefaults, userConfig, intent } = input;
  const { reasoningEffort } = userConfig;
  const commonOverrideConfig: Record<string, unknown> = {};

  if (userConfig.temperature !== undefined) {
    commonOverrideConfig.temperature = userConfig.temperature;
  }

  const modelSpecificConfig: {
    extra_body?: {
      google?: {
        thinking_config: Record<string, unknown>;
      };
    };
    reasoning_effort?: unknown;
  } = {};

  if (intent === 'insight') {
    modelSpecificConfig.extra_body = {
      google: {
        thinking_config: {
          // In real Gemini tests, insight calls need `include_thoughts` to get
          // the model's thinking, and Gemini puts that thinking into `content`.
          include_thoughts: true,
        },
      },
    };
  }

  if (reasoningEffort) {
    modelSpecificConfig.extra_body = {
      google: {
        thinking_config: {
          thinking_level: reasoningEffort,
          include_thoughts: true,
        },
      },
    };
  } else {
    // Gemini 3.x cannot fully disable native thinking, so use the lowest
    // supported effort unless the user explicitly requests another level.
    modelSpecificConfig.reasoning_effort = 'minimal';
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
  const match = content.match(/<thought>([\s\S]*?)<\/thought>/i);
  return match?.[1]?.trim() || undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type GeminiExtractedContent = {
  content: string;
  geminiReasoningContent: string;
};

const formatReasoningContent = ({
  geminiReasoningContent,
  providerReasoningContent,
}: {
  geminiReasoningContent: string;
  providerReasoningContent: string;
}): string => {
  if (geminiReasoningContent && providerReasoningContent) {
    return `thoughtParts：${geminiReasoningContent}; reasoning_content：${providerReasoningContent}`;
  }

  return geminiReasoningContent || providerReasoningContent || '';
};

const extractGeminiThoughtParts = (
  content: GeminiContentPart[],
): GeminiExtractedContent => {
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];

  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }

    const text = typeof part.text === 'string' ? part.text : undefined;
    if (!text) {
      continue;
    }

    if (part.thought === true) {
      reasoningParts.push(text);
    } else {
      contentParts.push(text);
    }
  }

  return {
    content: contentParts.join(''),
    geminiReasoningContent: reasoningParts.join(''),
  };
};

export const extractGeminiContentAndReasoning = (
  message: GeminiContentSource | undefined,
): ContentAndReasoning => {
  // Gemini native API exposes thought summaries in
  // `response.candidates[0].content.parts`, where each text part can carry
  // `thought: true`. Some OpenAI-compatible adapters may pass through a
  // native-like content-parts shape, even though the Gemini OpenAI
  // compatibility docs do not guarantee it.
  // Docs: https://ai.google.dev/gemini-api/docs/thinking#thought-summaries

  if (!message) {
    return {
      content: '',
      reasoning_content: '',
    };
  }

  if (Array.isArray(message.content)) {
    const extracted = extractGeminiThoughtParts(message.content);

    return {
      content: extracted.content,
      reasoning_content: formatReasoningContent({
        geminiReasoningContent: extracted.geminiReasoningContent,
        providerReasoningContent:
          typeof message.reasoning_content === 'string'
            ? message.reasoning_content
            : '',
      }),
    };
  }

  const result = defaultExtractContentAndReasoning(
    message as ChatCompletionContentSource,
  );
  // In real Gemini OpenAI-compatible responses we observed that
  // `include_thoughts` can still return a plain string `message.content`,
  // with the thought summary prepended as `<thought>...</thought>` before the
  // visible answer. Keep content unchanged, but extract that leading thought
  // text for report display.
  const geminiReasoningContent = extractInlineThought(result.content) || '';

  return {
    content: result.content,
    reasoning_content: formatReasoningContent({
      geminiReasoningContent,
      providerReasoningContent: result.reasoning_content,
    }),
  };
};

export const geminiAdapters = {
  gemini: {
    chatCompletion: {
      unsupportedUserConfig: ['reasoningEnabled', 'reasoningBudget'],
      buildChatCompletionParams: buildGeminiChatCompletionParams,
      extractContentAndReasoning: extractGeminiContentAndReasoning,
    },
    locate: {
      resultAdapter: {
        coordinates: { shape: 'bbox', order: 'yx', normalizedBy: 1000 },
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gemini'>;
