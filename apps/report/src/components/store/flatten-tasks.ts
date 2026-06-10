import type { ExecutionTask, GroupedActionDump } from '@midscene/core';

export const flattenGroupedDumpTasks = (
  groupedDump: GroupedActionDump | null,
): ExecutionTask[] => {
  if (!groupedDump) return [];
  const orderedExecutions = groupedDump.executions
    .map((execution, index) => ({ execution, index }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.execution.logTime)
        ? left.execution.logTime
        : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(right.execution.logTime)
        ? right.execution.logTime
        : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ execution }) => execution);

  return orderedExecutions.reduce<ExecutionTask[]>(
    (acc, execution) => acc.concat(execution.tasks),
    [],
  );
};
