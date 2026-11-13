import type { IModelConfig, TModelFamily } from '@midscene/shared/env';
import { ResolvedModelAdapter } from '../model-adapter/resolve';
import type {
  ModelAdapter,
  ModelAdapterDefinition,
  ModelRuntime,
} from '../model-adapter/types';
import { antLingAdapters } from './ant-ling/adapter';
import { autoGlmAdapters } from './auto-glm/adapter';
import { deepSeekAdapters } from './deepseek/adapter';
import { defaultOpenAICompatibleAdapterConfig } from './default';
import { doubaoAdapters } from './doubao';
import { drexAdapters } from './drex/adapter';
import { geminiAdapters } from './gemini';
import { glmAdapters } from './glm';
import { gptAdapters } from './gpt';
import { jevAdapters } from './jev/adapter';
import { kimiAdapters } from './kimi';
import { mimoAdapters } from './mimo';
import { qwenAdapters } from './qwen';
import { stepFunAdapters } from './stepfun';
import { tencentHyAdapters } from './tencent-hy';
import { uiTarsAdapters } from './ui-tars/adapter';

export const MODEL_ADAPTER_CONFIGS = {
  ...antLingAdapters,
  ...stepFunAdapters,
  ...jevAdapters,
  ...drexAdapters,
  ...qwenAdapters,
  ...deepSeekAdapters,
  ...doubaoAdapters,
  ...geminiAdapters,
  ...uiTarsAdapters,
  ...glmAdapters,
  ...autoGlmAdapters,
  ...gptAdapters,
  ...tencentHyAdapters,
  ...kimiAdapters,
  ...mimoAdapters,
} satisfies Record<TModelFamily, ModelAdapterDefinition>;

type ModelAdapterCacheKey = TModelFamily | 'default';

const modelAdapterCache = new Map<ModelAdapterCacheKey, ModelAdapter>();
export function getModelAdapter(modelFamily?: TModelFamily): ModelAdapter {
  const cacheKey: ModelAdapterCacheKey = modelFamily ?? 'default';
  let adapter = modelAdapterCache.get(cacheKey);
  if (adapter) {
    return adapter;
  }

  const config = modelFamily
    ? MODEL_ADAPTER_CONFIGS[modelFamily]
    : defaultOpenAICompatibleAdapterConfig;
  if (!config) {
    throw new Error(
      `No model adapter registered for modelFamily: ${modelFamily}`,
    );
  }

  adapter = new ResolvedModelAdapter(config, cacheKey);
  modelAdapterCache.set(cacheKey, adapter);

  return adapter;
}

export function getModelRuntime(config: IModelConfig): ModelRuntime {
  return {
    config,
    adapter: getModelAdapter(config.modelFamily),
  };
}
