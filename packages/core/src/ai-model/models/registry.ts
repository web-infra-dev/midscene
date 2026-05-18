import type { TModelFamily } from '@midscene/shared/env';
import type { LocateResultAdapter } from '../shared/model-locate-result';
import { autoGlmAdapters } from './auto-glm/adapter';
import { defaultOpenAICompatibleAdapterConfig } from './default';
import { doubaoAdapters } from './doubao';
import { geminiAdapters } from './gemini';
import { glmAdapters } from './glm';
import { gptAdapters } from './gpt';
import { qwenAdapters } from './qwen';
import { ResolvedModelAdapter } from './resolved';
import type { ModelAdapter, ModelAdapterDefinition } from './types';
import { uiTarsAdapters } from './ui-tars/adapter';

const modelFamilyRequiredForLocateMessage =
  'Model family is required for locate. Configure MIDSCENE_MODEL_FAMILY, or the intent-specific model family such as MIDSCENE_PLANNING_MODEL_FAMILY, so Midscene can parse locate coordinates correctly. https://midscenejs.com/model-config';

export const MODEL_ADAPTER_CONFIGS = {
  ...qwenAdapters,
  ...doubaoAdapters,
  ...geminiAdapters,
  ...uiTarsAdapters,
  ...glmAdapters,
  ...autoGlmAdapters,
  ...gptAdapters,
} satisfies Record<TModelFamily, ModelAdapterDefinition>;

export const MODEL_ADAPTERS = Object.fromEntries(
  Object.entries(MODEL_ADAPTER_CONFIGS).map(([modelFamily, config]) => [
    modelFamily,
    new ResolvedModelAdapter(config),
  ]),
) as Record<TModelFamily, ModelAdapter>;

export const defaultOpenAICompatibleAdapter = new ResolvedModelAdapter(
  defaultOpenAICompatibleAdapterConfig,
);

export function getModelAdapter(modelFamily?: TModelFamily): ModelAdapter {
  if (!modelFamily) {
    return defaultOpenAICompatibleAdapter;
  }

  const adapter = MODEL_ADAPTERS[modelFamily];
  if (!adapter) {
    throw new Error(
      `No model adapter registered for modelFamily: ${modelFamily}`,
    );
  }
  return adapter;
}

export function assertModelFamilyForLocate(
  modelFamily?: TModelFamily,
): asserts modelFamily is TModelFamily {
  if (!modelFamily) {
    throw new Error(modelFamilyRequiredForLocateMessage);
  }
}

export function getStandardLocateResultAdapter(
  modelFamily?: TModelFamily,
): LocateResultAdapter {
  assertModelFamilyForLocate(modelFamily);

  const locateAdapter = getModelAdapter(modelFamily).locate;
  if (locateAdapter.kind !== 'standard') {
    throw new Error(
      `Model family ${modelFamily || 'default'} does not use standard locate result adapter`,
    );
  }
  return locateAdapter.resultAdapter;
}
