import type { ModelAdapterDefinition } from '../model-adapter/types';

export const defaultOpenAICompatibleAdapterConfig: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: [
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ],
    // Users may omit modelFamily when using an OpenAI-compatible endpoint.
    // Many models expose useful assistant output through reasoning_content, so
    // the default adapter should still recover when content is empty.
    useReasoningAsContentFallback: true,
  },
};
