import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';

type PlanningParam = NonNullable<ExecutionTaskPlanningParam>;
type PlanningLocateParam = NonNullable<ExecutionTaskPlanningLocate['param']>;

type SubGoalsParam = Pick<PlanningParam, 'includeSubGoals'>;
type DeepLocateParam = Pick<PlanningLocateParam, 'deepLocate'>;

type ConsumedDumpFlagKeys = {
  includeSubGoals: keyof Pick<PlanningParam, 'includeSubGoals'>;
  deepLocate: keyof Pick<PlanningLocateParam, 'deepLocate'>;
};

export const consumedDumpFlagKeys = {
  includeSubGoals: 'includeSubGoals',
  deepLocate: 'deepLocate',
} as const satisfies ConsumedDumpFlagKeys;

export function hasSubGoalsFlag(task: ExecutionTask): boolean {
  // Sub-goals are a Planning component, not a per-locate-task flag.
  if (task.type !== 'Planning' || task.subType === 'Locate') {
    return false;
  }

  const param = task.param as Partial<SubGoalsParam> | undefined;

  return param?.[consumedDumpFlagKeys.includeSubGoals] === true;
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
