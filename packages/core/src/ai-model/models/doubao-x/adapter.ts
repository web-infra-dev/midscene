import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { createDoubaoXPlanningTapLocator } from './locate';
import { createDoubaoXPlanner } from './planning';

const doubaoXAdapter: ModelAdapterDefinition = {
  chatCompletion: {
    unsupportedUserConfig: [
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ],
    buildChatCompletionParams: ({ midsceneDefaults, userConfig }) => ({
      config: {
        ...midsceneDefaults,
        temperature: userConfig.temperature ?? 0.7,
      },
    }),
  },
  planning: {
    kind: 'custom',
    cacheEnabled: false,
    defaultReplanningCycleLimit: 40,
    planner: createDoubaoXPlanner(),
  },
  locate: {
    kind: 'custom',
    planningTapLocator: createDoubaoXPlanningTapLocator(),
  },
};

export const doubaoXAdapters = {
  'doubao-x': doubaoXAdapter,
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'doubao-x'>;
