import type { Awaitable } from '../engine/types';

export interface ResourceTask {
  readonly resources: readonly string[];
}

export interface TaskSchedulerOptions<TTask extends ResourceTask, TResult> {
  readonly tasks: readonly TTask[];
  readonly maxConcurrency: number;
  readonly run: (task: TTask, index: number) => Awaitable<TResult>;
  readonly signal?: AbortSignal;
  readonly shouldStop?: () => boolean;
}

/** Run tasks concurrently while preventing overlapping resource keys. */
export async function runTaskPool<TTask extends ResourceTask, TResult>(
  options: TaskSchedulerOptions<TTask, TResult>,
): Promise<readonly (TResult | undefined)[]> {
  if (
    !Number.isInteger(options.maxConcurrency) ||
    options.maxConcurrency <= 0
  ) {
    throw new TypeError(
      'Task scheduler maxConcurrency must be a positive integer.',
    );
  }

  const pending = options.tasks.map((_, index) => index);
  const results: Array<TResult | undefined> = new Array(options.tasks.length);
  const activeResources = new Set<string>();
  let active = 0;
  let firstError: unknown;
  let hasError = false;

  return await new Promise((resolve, reject) => {
    let settled = false;
    const stopRequested = () =>
      hasError ||
      options.signal?.aborted === true ||
      options.shouldStop?.() === true;
    const finish = () => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', pump);
      if (hasError) reject(firstError);
      else resolve(results);
    };
    const release = (resources: readonly string[]) => {
      for (const resource of resources) activeResources.delete(resource);
    };
    const claimRunnable = (): number | undefined => {
      const pendingIndex = pending.findIndex((taskIndex) =>
        options.tasks[taskIndex].resources.every(
          (resource) => !activeResources.has(resource),
        ),
      );
      if (pendingIndex < 0) return undefined;
      const [taskIndex] = pending.splice(pendingIndex, 1);
      return taskIndex;
    };
    function pump(): void {
      if (settled) return;
      while (active < options.maxConcurrency && !stopRequested()) {
        const taskIndex = claimRunnable();
        if (taskIndex === undefined) break;
        const task = options.tasks[taskIndex];
        for (const resource of task.resources) activeResources.add(resource);
        active += 1;
        Promise.resolve()
          .then(() => options.run(task, taskIndex))
          .then((result) => {
            results[taskIndex] = result;
          })
          .catch((error: unknown) => {
            if (!hasError) {
              hasError = true;
              firstError = error;
            }
          })
          .finally(() => {
            release(task.resources);
            active -= 1;
            pump();
          });
      }

      if (active === 0 && (pending.length === 0 || stopRequested())) finish();
    }

    options.signal?.addEventListener('abort', pump, { once: true });
    pump();
  });
}
