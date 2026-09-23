import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
} from '@midscene/core';

type PlanningLocateParam = NonNullable<ExecutionTaskPlanningLocate['param']>;

export function hasDeepLocateFlag(task: ExecutionTask): boolean {
  const param = task.param as Partial<PlanningLocateParam> | undefined;

  return param?.deepLocate === true;
}

/**
 * True when the task's recorder contains observed frames — i.e. it was
 * produced by an observer.aiAssert() / observer.aiBoolean() call rather
 * than a plain agent.aiAssert().
 */
export function hasObserverAssertionFlag(task: ExecutionTask): boolean {
  return task.recorder?.some((r) => r.timing === 'observed-frame') ?? false;
}
