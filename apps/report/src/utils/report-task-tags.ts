import type {
  ExecutionTask,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningParam,
} from '@midscene/core';

type PlanningParam = NonNullable<ExecutionTaskPlanningParam>;
type PlanningLocateParam = NonNullable<ExecutionTaskPlanningLocate['param']>;

type EffortParam = Pick<PlanningParam, 'effort'>;
type DeepLocateParam = Pick<PlanningLocateParam, 'deepLocate'>;

export interface ExtraActionSourceInfo {
  source: 'Extra Action' | 'Extra Action target';
  label: 'Extra Action' | 'Extra Target';
  name?: string;
  alias?: string;
  target?: unknown;
}

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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function getExtraActionSourceInfo(
  task: ExecutionTask,
): ExtraActionSourceInfo | undefined {
  const from = task.hitBy?.from;
  if (from !== 'Extra Action' && from !== 'Extra Action target') {
    return undefined;
  }

  const context = task.hitBy?.context;

  return {
    source: from,
    label: from === 'Extra Action' ? 'Extra Action' : 'Extra Target',
    name: nonEmptyString(context?.extraActionName),
    alias: nonEmptyString(context?.extraActionAlias),
    ...(context?.target !== undefined ? { target: context.target } : {}),
  };
}
