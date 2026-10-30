import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import type { LocateFn } from '../../workflows/grounding/types';
import { jevBoolean } from '../jev/boolean';
import { jevPlan } from '../jev/planning';

/**
 * Drex (nace.ai) answers System One noul and choice questions, so planning
 * and boolean insight reuse the Jev workflows. It has no box question, so
 * Locate is not a supported task type: the Agent routes Locate to the default
 * model, and a direct Locate call fails before any request is sent.
 */
const drexLocate: LocateFn = async () => {
  throw new Error(
    'Drex does not support Locate (System One box questions). Configure a general-purpose model for Locate; the Agent routes Locate to the default model when the Locate model family is drex.',
  );
};

export const drexAdapters = {
  drex: {
    modelType: 'system-one',
    allowedTaskTypes: ['boolean', 'planning'],
    supportedProtocols: [],
    locate: { kind: 'custom', locateFn: drexLocate },
    insight: { booleanFn: jevBoolean },
    planning: {
      kind: 'custom',
      planFn: jevPlan,
      cacheEnabled: false,
      supportsActionDeepLocate: false,
      defaultReplanningCycleLimit: 20,
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'drex'>;
