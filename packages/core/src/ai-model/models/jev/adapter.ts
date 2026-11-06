import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { jevBoolean } from './boolean';
import { jevLocate } from './locate';
import { jevPlan } from './planning';

export const jevAdapters = {
  jev: {
    modelType: 'system-one',
    allowedTaskTypes: ['locate', 'boolean', 'planning'],
    supportedProtocols: [],
    locate: { kind: 'custom', locateFn: jevLocate },
    insight: { booleanFn: jevBoolean },
    planning: {
      kind: 'custom',
      planFn: jevPlan,
      cacheEnabled: false,
      supportsActionDeepLocate: false,
      defaultReplanningCycleLimit: 20,
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'jev'>;
