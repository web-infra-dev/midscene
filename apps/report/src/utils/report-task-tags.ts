import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';

type PlanningParam = NonNullable<ExecutionTaskPlanningParam>;
type PlanningLocateParam = NonNullable<ExecutionTaskPlanningLocate['param']>;

type DeepThinkParam = Pick<PlanningParam, 'deepThink'>;
type DeepLocateParam = Pick<PlanningLocateParam, 'deepLocate'>;

type ConsumedDumpFlagKeys = {
  deepThink: keyof Pick<PlanningParam, 'deepThink'>;
  deepLocate: keyof Pick<PlanningLocateParam, 'deepLocate'>;
};

export const consumedDumpFlagKeys = {
  deepThink: 'deepThink',
  deepLocate: 'deepLocate',
} as const satisfies ConsumedDumpFlagKeys;

export function hasDeepThinkFlag(task: ExecutionTask): boolean {
  // deepThink is an aiAct planning-phase flag, not a per-locate-task flag.
  const param = task.param as Partial<DeepThinkParam> | undefined;

  return param?.[consumedDumpFlagKeys.deepThink] === true;
}

export function hasDeepLocateFlag(task: ExecutionTask): boolean {
  const param = task.param as Partial<DeepLocateParam> | undefined;

  return param?.[consumedDumpFlagKeys.deepLocate] === true;
}

export function hasRecordFrames(task: ExecutionTask): boolean {
  return Boolean(task.actionRecord?.frames?.length || task.recordSource);
}
