export type ManualControlTask = () => Promise<unknown>;
export type PendingManualControlTaskSource = () => ManualControlTask | null;

export class ManualControlFrozenError extends Error {
  constructor() {
    super(
      'Manual controls are frozen while the current operation is stopping.',
    );
    this.name = 'ManualControlFrozenError';
  }
}

export interface ManualControlCoordinator {
  enqueue<TResult>(task: () => Promise<TResult>): Promise<TResult>;
  freezeAndDrain(): Promise<void>;
  isFrozen(): boolean;
  registerPendingTaskSource(source: PendingManualControlTaskSource): () => void;
  resume(): void;
}

export function isManualControlFrozenError(
  error: unknown,
): error is ManualControlFrozenError {
  return error instanceof ManualControlFrozenError;
}

export function createManualControlCoordinator(): ManualControlCoordinator {
  let queueTail: Promise<void> = Promise.resolve();
  let frozen = false;
  let freezePromise: Promise<void> | null = null;
  const pendingTaskSources = new Set<PendingManualControlTaskSource>();

  const append = <TResult>(task: () => Promise<TResult>): Promise<TResult> => {
    const result = queueTail.then(task, task);
    queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    enqueue<TResult>(task: () => Promise<TResult>) {
      if (frozen) {
        return Promise.reject(new ManualControlFrozenError());
      }
      return append(task);
    },
    freezeAndDrain() {
      if (freezePromise) {
        return freezePromise;
      }

      frozen = true;
      for (const source of pendingTaskSources) {
        const pendingTask = source();
        if (pendingTask) {
          void append(pendingTask).catch(() => undefined);
        }
      }
      freezePromise = queueTail;
      return freezePromise;
    },
    isFrozen() {
      return frozen;
    },
    registerPendingTaskSource(source: PendingManualControlTaskSource) {
      pendingTaskSources.add(source);
      return () => {
        pendingTaskSources.delete(source);
      };
    },
    resume() {
      frozen = false;
      freezePromise = null;
    },
  };
}
