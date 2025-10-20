import { TaskRunner } from '@/task-runner';
import type {
  ExecutionTaskApply,
  ExecutionTaskProgressOptions,
  UIContext,
} from '@/types';

/**
 * Thin wrapper around {@link TaskRunner} that represents a single linear execution run.
 */
export class ExecutionSession {
  private readonly runner: TaskRunner;

  constructor(
    name: string,
    contextProvider: () => Promise<UIContext>,
    options?: ExecutionTaskProgressOptions & { tasks?: ExecutionTaskApply[] },
  ) {
    this.runner = new TaskRunner(name, contextProvider, options);
  }

  async append(tasks: ExecutionTaskApply[] | ExecutionTaskApply) {
    await this.runner.append(tasks);
  }

  async appendAndRun(tasks: ExecutionTaskApply[] | ExecutionTaskApply) {
    return this.runner.appendAndFlush(tasks);
  }

  async run() {
    return this.runner.flush();
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
