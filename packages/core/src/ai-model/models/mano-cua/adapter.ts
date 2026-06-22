import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { createManoCuaPlanningTapLocator } from './locate';
import { createManoCuaPlanner } from './planning';

export const manoCuaAdapters = {
  'mano-cua': {
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
          },
        };
      },
    },
    planning: {
      kind: 'custom',
      cacheEnabled: false,
      planner: createManoCuaPlanner(),
    },
    locate: {
      kind: 'custom',
      planningTapLocator: createManoCuaPlanningTapLocator(),
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'mano-cua'>;
