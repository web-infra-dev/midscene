import type { ExecutionTask, GroupedActionDump } from '@midscene/core';

export const flattenGroupedDumpTasks = (
  groupedDump: GroupedActionDump | null,
): ExecutionTask[] => {
  if (!groupedDump) return [];
  return groupedDump.executions.reduce<ExecutionTask[]>(
    (acc, execution) => acc.concat(execution.tasks),
    [],
  );
};
