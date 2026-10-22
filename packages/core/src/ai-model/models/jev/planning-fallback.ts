import type { AIUsageInfo, DeviceAction } from '@/types';
import { assert } from '@midscene/shared/utils';
import { standardPlan } from '../../workflows/planning/standard-planning';
import type { PlanFn, PlanOptions } from '../../workflows/planning/types';

export async function delegateJevPlanning(
  instruction: Parameters<PlanFn>[0],
  options: PlanOptions,
  reason: string,
  suggestedAction?: DeviceAction,
) {
  assert(
    options.getDefaultModelRuntime,
    'Default model runtime is required for Jev planning delegation',
  );
  const base = options.getDefaultModelRuntime();
  assert(
    base.config.modelFamily !== 'jev',
    'Jev cannot delegate planning to itself',
  );
  const runtime = {
    ...base,
    config: { ...base.config, intent: 'planning' as const },
    executionId: options.modelRuntime.executionId,
    onUsage: base.onUsage
      ? (usage: AIUsageInfo) => base.onUsage?.({ ...usage, intent: 'planning' })
      : undefined,
    modelFallback: {
      requestedModel: options.modelRuntime.config.modelName,
      requestedSlot: options.modelRuntime.config.slot,
      taskType: 'planning' as const,
      reason,
    },
  };
  const planner =
    runtime.adapter.planning.kind === 'custom'
      ? runtime.adapter.planning.planFn
      : standardPlan;
  const planningAdvice = suggestedAction
    ? `The preceding planner suggested that the next step may require action ${JSON.stringify(suggestedAction.name)} (${suggestedAction.description ?? suggestedAction.name}). This suggestion has NOT been executed and is advisory only. Independently determine the next step from the original goal, current screenshot, history and execution feedback. You may choose a different action or finish the task.`
    : undefined;
  return planner(instruction, {
    ...options,
    planningAdvice,
    modelRuntime: runtime,
    includeLocateInPlanning: false,
  });
}
