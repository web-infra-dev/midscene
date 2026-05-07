import type { ExecutionTask, ExecutorContext } from '@midscene/core';
import { uuid } from '@midscene/shared/utils';

/**
 * Build a synthetic `ExecutorContext` for a manual UI-driven action call.
 *
 * Manual interaction bypasses the normal task executor: there is no plan, no
 * dump, no retry policy. But `DeviceAction.call` requires an `ExecutorContext`
 * shaped like a regular task, so we pass through a minimal stub that carries
 * just enough context for downstream code that inspects `task.type` /
 * `task.subType` / `task.taskId`.
 */
export function createManualExecutorContext(
  actionType: string,
  param: unknown,
): ExecutorContext {
  const task: ExecutionTask = {
    type: 'Action Space',
    subType: actionType,
    param,
    executor: async () => undefined,
    taskId: `manual-${uuid()}`,
    status: 'running',
  };
  return { task };
}
