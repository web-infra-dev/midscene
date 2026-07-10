/**
 * Single source of truth for turning raw task/execution dump data into a
 * semantic status.
 *
 * Both the report sidebar (per-step status icon) and the merged-report
 * status aggregation must agree on what "failed" means, otherwise a merged
 * report can mark a failing case as passed. Keeping the rules here — as pure
 * functions over plain dump fields — lets the front-end icons and the backend
 * `mergeReportFiles` attribute derivation share the exact same logic.
 */
import type { ExecutionTask, TestStatus } from '../types';

/**
 * The subset of a task's fields needed to derive its status, picked from
 * `ExecutionTask` so the field names/types stay defined in one place. It is a
 * structural subset, so both the full `ExecutionTask` and the front-end task
 * variants (which carry extra fields) satisfy it.
 */
export type TaskStatusFields = Partial<
  Pick<ExecutionTask, 'status' | 'subType' | 'error' | 'errorMessage'> & {
    // `output` is only ever compared to `false`; keep it `unknown` rather than
    // the picked generic `any` so the field stays type-safe for callers.
    output: unknown;
  }
>;

export type DerivedTaskStatus =
  | 'passed'
  | 'failed'
  | 'warning'
  | 'pending'
  | 'running'
  | 'cancelled';

/**
 * Derive a single task's semantic status from its raw dump fields. Mirrors the
 * historical `getStatusIcon` logic in the report sidebar so icons and merged
 * status never diverge.
 */
export function deriveTaskStatus(task: TaskStatusFields): DerivedTaskStatus {
  const isFinished = task.status === 'finished';

  // Hard failure: the task threw / was aborted (status === 'failed', e.g. a
  // failed Assert which throws `Assertion failed`, or a locate failure), or it
  // finished but still carries an error.
  if (task.status === 'failed') {
    return 'failed';
  }
  if (isFinished && (task.error || task.errorMessage)) {
    return 'failed';
  }

  // A `WaitFor` that finished falsy is a warning, not a hard failure.
  if (isFinished && task.subType === 'WaitFor' && task.output === false) {
    return 'warning';
  }

  // An `Assert` that finished with a falsy result is a failure. This is a
  // legacy fallback: modern asserts throw and are caught above.
  if (task.subType === 'Assert' && isFinished && task.output === false) {
    return 'failed';
  }

  if (task.status === 'pending') return 'pending';
  if (task.status === 'running') return 'running';
  if (task.status === 'cancelled') return 'cancelled';

  // finished, no error
  return 'passed';
}

/**
 * Aggregate the tasks of one case (a list of executions) into a single
 * `TestStatus`. A case is `failed` when any of its tasks derives to `failed`;
 * otherwise it is `passed`. Warnings, pending/running/cancelled steps do not by
 * themselves fail a case.
 *
 * This only ever produces `passed` / `failed`; the finer `timedOut` /
 * `skipped` / `interrupted` statuses can only come from a source report that
 * already recorded them (e.g. a Playwright run), which callers should prefer
 * when available.
 */
export function deriveCaseStatus(
  executions: Array<{ tasks?: TaskStatusFields[] }>,
): TestStatus {
  for (const execution of executions) {
    for (const task of execution.tasks ?? []) {
      if (deriveTaskStatus(task) === 'failed') {
        return 'failed';
      }
    }
  }
  return 'passed';
}
