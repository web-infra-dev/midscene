import type {
  CacheActionVerificationRequest,
  CacheActionVerificationStatus,
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
  if (task.type !== 'Planning' || task.subType === 'Locate') {
    return false;
  }

  const param = task.param as Partial<DeepThinkParam> | undefined;

  return param?.[consumedDumpFlagKeys.deepThink] === true;
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

type CacheActionVerificationDisplay = {
  status: CacheActionVerificationStatus;
  statusLabel: string;
  label: string;
  color: 'success' | 'error' | 'warning';
  reason: string;
  request: Omit<CacheActionVerificationRequest, 'dataDemand'> & {
    dataDemand: string;
  };
};

const cacheActionVerificationStatusDisplay = {
  passed: { statusLabel: 'Passed', color: 'success' },
  failed: { statusLabel: 'Failed', color: 'error' },
  uncertain: { statusLabel: 'Uncertain', color: 'warning' },
} as const satisfies Record<
  CacheActionVerificationStatus,
  Pick<CacheActionVerificationDisplay, 'statusLabel' | 'color'>
>;

export function getCacheActionVerificationDisplay(
  task: ExecutionTask,
): CacheActionVerificationDisplay | undefined {
  const verification = task.cacheActionVerification;
  if (!verification) {
    return undefined;
  }

  const display = cacheActionVerificationStatusDisplay[verification.status];
  return {
    status: verification.status,
    statusLabel: display.statusLabel,
    label: `AI Verify: ${display.statusLabel}`,
    color: display.color,
    reason: verification.reason,
    request: {
      ...verification.request,
      dataDemand: JSON.stringify(verification.request.dataDemand, null, 2),
    },
  };
}
