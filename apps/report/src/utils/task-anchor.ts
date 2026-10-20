import type { ExecutionTask, GroupedActionDump } from '@midscene/core';

// Every selectable sidebar node (a task row) maps to a URL hash anchor so the
// currently viewed task can be deep-linked and restored on reload. The anchor
// is `task-<taskId>`; taskId is a uuid that is always assigned and serialized
// into the report.
const ANCHOR_PREFIX = 'task-';

/** Build the hash anchor id for a task. */
export function anchorIdForTask(task: ExecutionTask): string {
  if (!task.taskId) {
    throw new Error('Cannot build a hash anchor for a task without a taskId');
  }
  return `${ANCHOR_PREFIX}${task.taskId}`;
}

/**
 * Resolve the task referenced by a hash anchor within the given dump. Accepts a
 * hash with or without the leading `#`. Returns `null` when the anchor does not
 * point at a task in this dump (e.g. it belongs to another case).
 */
export function findTaskByAnchor(
  dump: GroupedActionDump | null,
  hashOrAnchor: string,
): ExecutionTask | null {
  if (!dump || !hashOrAnchor) return null;
  const anchor = hashOrAnchor.startsWith('#')
    ? hashOrAnchor.slice(1)
    : hashOrAnchor;
  if (!anchor.startsWith(ANCHOR_PREFIX)) return null;
  const taskId = anchor.slice(ANCHOR_PREFIX.length);

  for (const execution of dump.executions) {
    for (const task of execution.tasks) {
      if (task.taskId === taskId) {
        return task;
      }
    }
  }

  return null;
}
