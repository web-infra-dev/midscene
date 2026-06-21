import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../types';
import { createAutoGlmPlanningTapLocator } from './locate';
import { createAutoGlmPlanner } from './planning';

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
      defaultReplanningCycleLimit: 100,
      planner: createAutoGlmPlanner(isMultilingual),
    },
    locate: {
      kind: 'custom',
      planningTapLocator: createAutoGlmPlanningTapLocator(isMultilingual),
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
