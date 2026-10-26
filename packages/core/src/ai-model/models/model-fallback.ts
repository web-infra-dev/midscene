import type { IModelConfig, TIntent } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { ModelRuntime, ModelTaskType } from '../model-adapter/types';
import { getModelRuntime } from './registry';

export function resolveModelForTaskType(
  configs: { getModelConfig(intent: TIntent): IModelConfig },
  intent: TIntent,
  taskType: ModelTaskType,
): ModelRuntime {
  const requested = getModelRuntime(configs.getModelConfig(intent));
  if (
    !requested.adapter.supportedTaskTypes ||
    requested.adapter.supportedTaskTypes.includes(taskType)
  ) {
    return requested;
  }
  const config = configs.getModelConfig('default');
  const runtime = getModelRuntime({ ...config, intent });
  if (
    runtime.adapter.supportedTaskTypes &&
    !runtime.adapter.supportedTaskTypes.includes(taskType)
  ) {
    throw new Error(
      `The default model cannot perform ${taskType}. Configure a general-purpose default model.`,
    );
  }
  const reason = `${requested.config.modelFamily} does not support ${taskType}; using the default model`;
  getDebug('ai:model-fallback', { console: true })(reason);
  return {
    ...runtime,
    modelFallback: {
      requestedModel: requested.config.modelName,
      requestedSlot: requested.config.slot,
      taskType,
      reason,
    },
  };
}
