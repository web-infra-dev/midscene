import type { TModelFamily } from '@midscene/shared/env';
import type {
  ChatCompletionParamsResult,
  ModelAdapterDefinition,
  ModelCallContext,
} from './types';

const buildGeminiChatCompletionParams = ({
  reasoningEffort,
}: ModelCallContext): ChatCompletionParamsResult => {
  const config: Record<string, unknown> = {};
  if (!reasoningEffort) {
    return { config };
  }
  config.reasoning_effort = reasoningEffort;
  return {
    config,
    debugMessages: [`reasoning_effort="${reasoningEffort}"`],
  };
};

export const geminiAdapters = {
  gemini: {
    chatCompletion: {
      buildChatCompletionParams: buildGeminiChatCompletionParams,
    },
    locate: {
      resultAdapter: {
        format: 'bbox-normalized-0-1000-yxyx',
        locateResultFormatDescriptor: 'box_2d bounding box',
      },
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'gemini'>;
