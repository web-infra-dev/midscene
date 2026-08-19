import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';

type PlanningParam = NonNullable<ExecutionTaskPlanningParam>;
type PlanningLocateParam = NonNullable<ExecutionTaskPlanningLocate['param']>;

type EffortParam = Pick<PlanningParam, 'effort'>;
type DeepLocateParam = Pick<PlanningLocateParam, 'deepLocate'>;

type ConsumedDumpFlagKeys = {
  effort: keyof Pick<PlanningParam, 'effort'>;
  deepLocate: keyof Pick<PlanningLocateParam, 'deepLocate'>;
};

export const consumedDumpFlagKeys = {
  effort: 'effort',
  deepLocate: 'deepLocate',
} as const satisfies ConsumedDumpFlagKeys;

export function hasDeepThinkFlag(task: ExecutionTask): boolean {
  // effort is an aiAct planning-phase option, not a per-locate-task flag.
  if (task.type !== 'Planning' || task.subType === 'Locate') {
    return false;
  }

  const param = task.param as Partial<EffortParam> | undefined;

  return param?.[consumedDumpFlagKeys.effort] === 'deepThink';
}

export function hasDeepLocateFlag(task: ExecutionTask): boolean {
  const param = task.param as Partial<DeepLocateParam> | undefined;

  return param?.[consumedDumpFlagKeys.deepLocate] === true;
}

/**
 * True when the task's recorder contains observed frames — i.e. it was
 * produced by an observer.aiAssert() / observer.aiBoolean() call rather
 * than a plain agent.aiAssert().
 */
export function hasObserverAssertionFlag(task: ExecutionTask): boolean {
  return task.recorder?.some((r) => r.timing === 'observed-frame') ?? false;
}
