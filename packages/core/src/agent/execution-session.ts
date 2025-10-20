import { Executor } from '@/executor';
import type {
  ExecutionTaskApply,
  ExecutionTaskProgressOptions,
  UIContext,
} from '@/types';

/**
 * Thin wrapper around {@link Executor} that represents a single linear execution run.
 */
export class ExecutionSession {
  private readonly executor: Executor;

  constructor(
    name: string,
    contextProvider: () => Promise<UIContext>,
    options?: ExecutionTaskProgressOptions & { tasks?: ExecutionTaskApply[] },
  ) {
    this.executor = new Executor(name, contextProvider, options);
  }

  async append(tasks: ExecutionTaskApply[] | ExecutionTaskApply) {
    await this.executor.append(tasks);
  }

  async appendAndRun(tasks: ExecutionTaskApply[] | ExecutionTaskApply) {
    return this.executor.appendAndFlush(tasks);
  }

  async run() {
    return this.executor.flush();
  }

  isInErrorState() {
    return this.executor.isInErrorState();
  }

  latestErrorTask() {
    return this.executor.latestErrorTask();
  }

  appendErrorPlan(errorMsg: string) {
    return this.executor.appendErrorPlan(errorMsg);
  }

  getExecutor() {
    return this.executor;
  }

}
