import type {
  IModelConfig,
  TModelFamily,
  TModelFamilyRef,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { autoGlmAdapters } from './auto-glm/adapter';
import {
  getCustomModelAdapterCacheKey,
  isCustomModelAdapterRef,
  loadCustomModelAdapterDefinition,
} from './custom';
import { defaultOpenAICompatibleAdapterConfig } from './default';
import { doubaoAdapters } from './doubao';
import { geminiAdapters } from './gemini';
import { glmAdapters } from './glm';
import { gptAdapters } from './gpt';
import { kimiAdapters } from './kimi';
import { qwenAdapters } from './qwen';
import { ResolvedModelAdapter } from './resolved';
import type {
  ModelAdapter,
  ModelAdapterDefinition,
  ModelRuntime,
} from './types';
import { uiTarsAdapters } from './ui-tars/adapter';

export const MODEL_ADAPTER_CONFIGS = {
  ...qwenAdapters,
  ...doubaoAdapters,
  ...geminiAdapters,
  ...uiTarsAdapters,
  ...glmAdapters,
  ...autoGlmAdapters,
  ...gptAdapters,
  ...kimiAdapters,
} satisfies Record<TModelFamily, ModelAdapterDefinition>;

type ModelAdapterCacheKey = TModelFamily | 'default' | `custom:${string}`;

const modelAdapterCache = new Map<ModelAdapterCacheKey, ModelAdapter>();
const debugModelAdapter = getDebug('ai:model-adapter');

function debugAdapterUnsupportedUserConfig(
  modelFamily: ModelAdapterCacheKey,
  adapter: ModelAdapter,
): void {
  if (adapter.chatCompletion.unsupportedUserConfig.length === 0) {
    return;
  }

  debugModelAdapter(
    `model adapter "${modelFamily}" unsupportedUserConfig: ${JSON.stringify(
      adapter.chatCompletion.unsupportedUserConfig,
    )}`,
  );
}

export function getModelAdapter(modelFamily?: TModelFamilyRef): ModelAdapter {
  const cacheKey: ModelAdapterCacheKey = isCustomModelAdapterRef(modelFamily)
    ? (getCustomModelAdapterCacheKey(modelFamily) as `custom:${string}`)
    : (modelFamily ?? 'default');
  let adapter = modelAdapterCache.get(cacheKey);
  if (adapter) {
    return adapter;
  }

  const config = isCustomModelAdapterRef(modelFamily)
    ? loadCustomModelAdapterDefinition(modelFamily)
    : modelFamily
      ? MODEL_ADAPTER_CONFIGS[modelFamily]
      : defaultOpenAICompatibleAdapterConfig;
  if (!config) {
    throw new Error(
      `No model adapter registered for modelFamily: ${modelFamily}`,
    );
  }

  adapter = new ResolvedModelAdapter(config, cacheKey);
  modelAdapterCache.set(cacheKey, adapter);
  debugAdapterUnsupportedUserConfig(cacheKey, adapter);

  return adapter;
}

export function getModelRuntime(config: IModelConfig): ModelRuntime {
  return {
    config,
    adapter: getModelAdapter(config.modelFamily),
  };
}
