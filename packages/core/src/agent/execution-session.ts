import { type TaskExecutionError, TaskRunner } from '@/task-runner';
import type {
  ExecutionTaskApply,
  ExecutionTaskProgressOptions,
  UIContext,
} from '@/types';

type ExecutionSessionOptions = ExecutionTaskProgressOptions & {
  tasks?: ExecutionTaskApply[];
  onTaskUpdate?: (
    runner: TaskRunner,
    error?: TaskExecutionError,
  ) => Promise<void> | void;
};

/**
 * Thin wrapper around {@link TaskRunner} that represents a single linear execution run.
 */
export class ExecutionSession {
  private readonly runner: TaskRunner;

  constructor(
    name: string,
    contextProvider: () => Promise<UIContext>,
    options?: ExecutionSessionOptions,
  ) {
    this.runner = new TaskRunner(name, contextProvider, options);
  }

  async append(
    tasks: ExecutionTaskApply[] | ExecutionTaskApply,
    options?: { allowWhenError?: boolean },
  ) {
    await this.runner.append(tasks, options);
  }

  async appendAndRun(
    tasks: ExecutionTaskApply[] | ExecutionTaskApply,
    options?: { allowWhenError?: boolean; signal?: AbortSignal },
  ) {
    return this.runner.appendAndFlush(tasks, options);
  }

  async run(options?: { allowWhenError?: boolean; signal?: AbortSignal }) {
    return this.runner.flush(options);
  }

  isInErrorState() {
    return this.runner.isInErrorState();
  }

  latestErrorTask() {
    return this.runner.latestErrorTask();
  }

  appendErrorPlan(errorMsg: string) {
    return this.runner.appendErrorPlan(errorMsg);
  }

  getRunner() {
    return this.runner;
  }
}
