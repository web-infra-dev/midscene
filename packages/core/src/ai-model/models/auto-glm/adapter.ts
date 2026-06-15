import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../types';
import { autoGlmLocate } from './locate';
import { createAutoGlmPlanner } from './planning';

const defaultAutoGlmReplanningCycleLimit = 100;

function createAutoGlmAdapter(isMultilingual: boolean): ModelAdapterDefinition {
  return {
    chatCompletion: {
      unsupportedUserConfig: [
        'reasoningEnabled',
        'reasoningEffort',
        'reasoningBudget',
      ],
      buildChatCompletionParams: ({ midsceneDefaults, userConfig }) => {
        const commonOverrideConfig: Record<string, unknown> = {};

        if (userConfig.temperature !== undefined) {
          commonOverrideConfig.temperature = userConfig.temperature;
        }

        const modelSpecificConfig = {
          top_p: 0.85,
          frequency_penalty: 0.2,
        };

        return {
          config: {
            ...midsceneDefaults,
            ...commonOverrideConfig,
            ...modelSpecificConfig,
          },
        };
      },
    },
    planning: {
      kind: 'custom',
      cacheEnabled: false,
      defaultReplanningCycleLimit: defaultAutoGlmReplanningCycleLimit,
      planner: createAutoGlmPlanner(isMultilingual),
    },
    locate: {
      kind: 'custom',
      locateFn: (elementDescription, options) =>
        autoGlmLocate(elementDescription, options, isMultilingual),
    },
  };
}

export const autoGlmAdapters = {
  'auto-glm': createAutoGlmAdapter(false),
  'auto-glm-multilingual': createAutoGlmAdapter(true),
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'auto-glm' | 'auto-glm-multilingual'
>;
