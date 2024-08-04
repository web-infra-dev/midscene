import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskInsightLocate,
  InsightDump,
} from '@midscene/core';
/* eslint-disable @typescript-eslint/no-empty-function */
import dayjs from 'dayjs';

export function insightDumpToExecutionDump(
  insightDump: InsightDump | InsightDump[],
): ExecutionDump {
  const insightToTask = (
    insightDump: InsightDump,
  ): ExecutionTaskInsightLocate => {
    const task: ExecutionTaskInsightLocate = {
      type: 'Insight',
      subType: insightDump.type === 'locate' ? 'Locate' : 'Query',
      status: insightDump.error ? 'fail' : 'success',
      param: {
        ...(insightDump.userQuery.element
          ? { query: insightDump.userQuery }
          : {}),
        ...(insightDump.userQuery.dataDemand
          ? { dataDemand: insightDump.userQuery.dataDemand }
          : {}),
        insight: {} as any,
      } as any,
      log: {
        dump: insightDump,
      },
      timing: {
        end: insightDump.logTime,
        cost: insightDump.taskInfo?.durationMs,
        start: insightDump.logTime - insightDump.taskInfo?.durationMs,
      },
      executor: () => {},
    };
    return task;
  };

  if (!Array.isArray(insightDump)) {
    const result: ExecutionDump = {
      sdkVersion: insightDump.sdkVersion,
      logTime: insightDump.logTime,
      name: 'Insight',
      tasks: [insightToTask(insightDump)],
    };
    return result;
  }
  const result: ExecutionDump = {
    sdkVersion: insightDump[0].sdkVersion,
    logTime: insightDump[0].logTime,
    name: 'Insight',
    tasks: insightDump.map(insightToTask),
  };
  return result;
}

export function timeStr(timestamp?: number) {
  return timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '-';
}

export function typeStr(task: ExecutionTask) {
  return task.subType ? `${task.type} / ${task.subType || ''}` : task.type;
}

export function filterBase64Value(input: string) {
  return input.replace(/data:image\/[^"]+"/g, 'data:image..."');
}
