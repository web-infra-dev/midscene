import type { ModelAdapterDefinition } from './types';

export const defaultOpenAICompatibleAdapterConfig: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: [
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ],
  },
};
