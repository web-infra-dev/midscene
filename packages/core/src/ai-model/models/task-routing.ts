import type { IModelConfig, TIntent } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { ModelRuntime, ModelTask } from '../model-adapter/types';
import { getModelRuntime } from './registry';

export function resolveModelForTask(
  configs: { getModelConfig(intent: TIntent): IModelConfig },
  intent: TIntent,
  task: ModelTask,
): ModelRuntime {
  const requested = getModelRuntime(configs.getModelConfig(intent));
  if (
    !requested.adapter.supportedTasks ||
    requested.adapter.supportedTasks.includes(task)
  ) {
    return requested;
  }
  const config = configs.getModelConfig('default');
  const runtime = getModelRuntime({ ...config, intent });
  if (
    runtime.adapter.supportedTasks &&
    !runtime.adapter.supportedTasks.includes(task)
  ) {
    throw new Error(
      `The default model cannot perform ${task}. Configure a general-purpose default model.`,
    );
  }
  const reason = `${requested.config.modelFamily} does not support ${task}; using the default model`;
  getDebug('ai:model-routing', { console: true })(reason);
  return {
    ...runtime,
    modelRouting: {
      requestedModel: requested.config.modelName,
      requestedSlot: requested.config.slot,
      task,
      reason,
    },
  };
}
