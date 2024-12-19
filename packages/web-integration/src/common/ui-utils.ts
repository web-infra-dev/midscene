import type {
  ExecutionTask,
  ExecutionTaskAction,
  ExecutionTaskActionApply,
  ExecutionTaskInsightAssertion,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightQuery,
  ExecutionTaskPlanning,
  PlanningActionParamScroll,
} from '@midscene/core';

export function typeStr(task: ExecutionTask) {
  return task.subType ? `${task.type} / ${task.subType || ''}` : task.type;
}

export function paramStr(task: ExecutionTask) {
  let value: string | undefined | object;
  if (task.type === 'Planning') {
    value = (task as ExecutionTaskPlanning)?.param?.userPrompt;
  }

  if (task.type === 'Insight') {
    value =
      (task as ExecutionTaskInsightLocate)?.param?.prompt ||
      (task as ExecutionTaskInsightLocate)?.param?.id ||
      (task as ExecutionTaskInsightQuery)?.param?.dataDemand ||
      (task as ExecutionTaskInsightAssertion)?.param?.assertion;
  }

  if (task.type === 'Action') {
    const sleepMs = (task as ExecutionTaskAction)?.param?.timeMs;
    const scrollType = (
      task as ExecutionTask<ExecutionTaskActionApply<PlanningActionParamScroll>>
    )?.param?.scrollType;
    if (sleepMs) {
      value = `${sleepMs}ms`;
    } else if (scrollType) {
      const scrollDirection = (
        task as ExecutionTask<
          ExecutionTaskActionApply<PlanningActionParamScroll>
        >
      )?.param?.direction;
      const scrollDistance = (
        task as ExecutionTask<
          ExecutionTaskActionApply<PlanningActionParamScroll>
        >
      )?.param?.distance;
      value = `${scrollDirection}, ${scrollType}, ${scrollDistance || 'distance-not-set'}`;
    } else {
      value =
        (task as ExecutionTaskAction)?.param?.value ||
        (task as ExecutionTaskAction)?.param?.scrollType;
    }

    if (!value) {
      value = task.thought;
    }
  }

  if (typeof value === 'undefined') return '';
  return typeof value === 'string'
    ? value
    : JSON.stringify(value, undefined, 2);
}
