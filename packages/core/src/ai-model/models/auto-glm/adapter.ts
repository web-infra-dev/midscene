import type { TModelFamily } from '@midscene/shared/env';
import type { ModelAdapterDefinition } from '../types';
import { autoGlmLocate } from './locate';
import { autoGlmPlanning } from './planning';
import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMChinesePlanPrompt,
  getAutoGLMMultilingualLocatePrompt,
  getAutoGLMMultilingualPlanPrompt,
} from './prompt';

const defaultAutoGlmReplanningCycleLimit = 100;

function createAutoGlmAdapter({
  getPlanPrompt,
  getLocatePrompt,
}: {
  getPlanPrompt: () => string;
  getLocatePrompt: () => string;
}): ModelAdapterDefinition {
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
      planFn: (userInstruction, options) =>
        autoGlmPlanning(userInstruction, options, getPlanPrompt),
    },
    locate: {
      kind: 'custom',
      locateFn: (elementDescription, options) =>
        autoGlmLocate(elementDescription, options, getLocatePrompt),
    },
  };
}

export const autoGlmAdapters = {
  'auto-glm': createAutoGlmAdapter({
    getPlanPrompt: getAutoGLMChinesePlanPrompt,
    getLocatePrompt: getAutoGLMChineseLocatePrompt,
  }),
  'auto-glm-multilingual': createAutoGlmAdapter({
    getPlanPrompt: getAutoGLMMultilingualPlanPrompt,
    getLocatePrompt: getAutoGLMMultilingualLocatePrompt,
  }),
} satisfies Pick<
  Record<TModelFamily, ModelAdapterDefinition>,
  'auto-glm' | 'auto-glm-multilingual'
>;
