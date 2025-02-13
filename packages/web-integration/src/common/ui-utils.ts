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

export function getKeyCommands(
  value: string | string[],
): Array<{ key: string; command?: string }> {
  // Ensure value is an array of keys
  const keys = Array.isArray(value) ? value : [value];

  // Process each key to attach a corresponding command if needed, based on the presence of 'Meta' or 'Control' in the keys array.
  // ref: https://github.com/puppeteer/puppeteer/pull/9357/files#diff-32cf475237b000f980eb214a0a823e45a902bddb7d2426d677cae96397aa0ae4R94
  return keys.reduce((acc: Array<{ key: string; command?: string }>, k) => {
    const includeMeta = keys.includes('Meta') || keys.includes('Control');
    if (includeMeta && (k === 'a' || k === 'A')) {
      return acc.concat([{ key: k, command: 'SelectAll' }]);
    }
    if (includeMeta && (k === 'c' || k === 'C')) {
      return acc.concat([{ key: k, command: 'Copy' }]);
    }
    if (includeMeta && (k === 'v' || k === 'V')) {
      return acc.concat([{ key: k, command: 'Paste' }]);
    }
    return acc.concat([{ key: k }]);
  }, []);
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
      value = `${scrollDirection || 'down'}, ${scrollType || 'once'}, ${
        scrollDistance || 'distance-not-set'
      }`;
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
