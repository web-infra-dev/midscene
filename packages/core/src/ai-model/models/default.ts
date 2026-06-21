import type { ModelAdapterDefinition } from '../model-adapter/types';

export const defaultOpenAICompatibleAdapterConfig: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: [
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ],
  },
};
