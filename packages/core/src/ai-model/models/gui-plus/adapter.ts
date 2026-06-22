import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { createGuiPlus20260226PlanningTapLocator } from './locate';
import { createGuiPlus20260226Planner } from './planning';

const guiPlus20260226Adapter: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: ['reasoningEffort', 'reasoningBudget'],
    buildChatCompletionParams: ({ midsceneDefaults, userConfig }) => {
      const commonOverrideConfig: Record<string, unknown> = {};

      if (userConfig.temperature !== undefined) {
        commonOverrideConfig.temperature = userConfig.temperature;
      }

      if (userConfig.reasoningEnabled !== undefined) {
        commonOverrideConfig.enable_thinking = userConfig.reasoningEnabled;
      }

      return {
        config: {
          ...midsceneDefaults,
          ...commonOverrideConfig,
          vl_high_resolution_images: true,
        },
      };
    },
  },
  planning: {
    kind: 'custom',
    cacheEnabled: false,
    defaultReplanningCycleLimit: 20,
    planner: createGuiPlus20260226Planner(),
  },
  locate: {
    kind: 'custom',
    planningTapLocator: createGuiPlus20260226PlanningTapLocator(),
  },
};

export const guiPlusAdapters = {
  'gui-plus-2026-02-26': guiPlus20260226Adapter,
};
