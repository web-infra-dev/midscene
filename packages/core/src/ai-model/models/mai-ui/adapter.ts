import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { createMaiUiPlanningTapLocator } from './locate';
import { createMaiUiPlanner } from './planning';

export const maiUiAdapters = {
  'mai-ui': {
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

        return {
          config: {
            ...midsceneDefaults,
            ...commonOverrideConfig,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            seed: 42,
            extra_body: {
              repetition_penalty: 1.0,
              top_k: -1,
            },
          },
        };
      },
    },
    planning: {
      kind: 'custom',
      cacheEnabled: false,
      planner: createMaiUiPlanner(),
    },
    locate: {
      kind: 'custom',
      planningTapLocator: createMaiUiPlanningTapLocator(),
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'mai-ui'>;
