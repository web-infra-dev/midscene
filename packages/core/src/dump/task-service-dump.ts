import type { ExecutionTask, Rect, ServiceDump } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isServiceDump(value: unknown): value is ServiceDump {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    isRecord(value.taskInfo)
  );
}

export function getTaskServiceDump(
  task?: ExecutionTask | null,
): ServiceDump | null {
  const log = task?.log as unknown;

  if (isRecord(log) && isServiceDump(log.dump)) {
    return log.dump;
  }

  return null;
}

export function getTaskSearchArea(
  task?: ExecutionTask | null,
): Rect | undefined {
  return task?.searchArea ?? getTaskServiceDump(task)?.taskInfo?.searchArea;
}
