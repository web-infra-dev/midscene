import type { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
  type ExecutionRecorderItem,
  type ExecutionTask,
  type ExecutionTaskActionApply,
  type ExecutionTaskApply,
  type ExecutionTaskPlanningLocateOutput,
  type ExecutionTaskProgressOptions,
  type ExecutionTaskReturn,
  type ExecutorContext,
  type PlanningActionParamError,
  type UIContext,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert, uuid } from '@midscene/shared/utils';

const debug = getDebug('task-runner');
const UI_CONTEXT_CACHE_TTL_MS = 300;

type TaskRunnerInitOptions = ExecutionTaskProgressOptions & {
  tasks?: ExecutionTaskApply[];
  onTaskUpdate?: (
    runner: TaskRunner,
    error?: TaskExecutionError,
  ) => Promise<void> | void;
};

type TaskRunnerOperationOptions = {
  allowWhenError?: boolean;
  signal?: AbortSignal;
};

export class TaskRunner {
  name: string;

  tasks: ExecutionTask[];

  // status of runner
  status: 'init' | 'pending' | 'running' | 'completed' | 'error';

  onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];

  private readonly uiContextBuilder: () => Promise<UIContext>;

  private readonly onTaskUpdate?:
    | ((runner: TaskRunner, error?: TaskExecutionError) => Promise<void> | void)
    | undefined;

  constructor(
    name: string,
    uiContextBuilder: () => Promise<UIContext>,
    options?: TaskRunnerInitOptions,
  ) {
    this.status =
      options?.tasks && options.tasks.length > 0 ? 'pending' : 'init';
    this.name = name;
    this.tasks = (options?.tasks || []).map((item) =>
      this.markTaskAsPending(item),
    );
    this.onTaskStart = options?.onTaskStart;
    this.uiContextBuilder = uiContextBuilder;
    this.onTaskUpdate = options?.onTaskUpdate;
  }

  private async emitOnTaskUpdate(error?: TaskExecutionError): Promise<void> {
    if (!this.onTaskUpdate) {
      return;
    }
    await this.onTaskUpdate(this, error);
  }

  private lastUiContext?: {
    context: UIContext;
    capturedAt: number;
  };

  private async getUiContext(options?: { forceRefresh?: boolean }): Promise<
    UIContext | undefined
  > {
    const now = Date.now();
    const shouldReuse =
      !options?.forceRefresh &&
      this.lastUiContext &&
      now - this.lastUiContext.capturedAt <= UI_CONTEXT_CACHE_TTL_MS;

    if (shouldReuse && this.lastUiContext?.context) {
      debug(
        `reuse cached uiContext captured ${now - this.lastUiContext.capturedAt}ms ago`,
      );
      return this.lastUiContext?.context;
    }

    try {
      const uiContext = await this.uiContextBuilder();
      if (uiContext) {
        this.lastUiContext = {
          context: uiContext,
          capturedAt: Date.now(),
        };
      } else {
        this.lastUiContext = undefined;
      }
      return uiContext;
    } catch (error) {
      this.lastUiContext = undefined;
      throw error;
    }
  }

  private async captureScreenshot(): Promise<ScreenshotItem | undefined> {
    try {
      const uiContext = await this.getUiContext({ forceRefresh: true });
      return uiContext?.screenshot;
    } catch (error) {
      console.error('error while capturing screenshot', error);
    }
    return undefined;
  }

  private attachRecorderItem(
    task: ExecutionTask,
    screenshot: ScreenshotItem | undefined,
    phase: 'after-calling',
  ): void {
    if (!phase || !screenshot) {
      return;
    }

    const recorderItem: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot,
      timing: phase,
    };

    if (!task.recorder) {
      task.recorder = [recorderItem];
      return;
    }
    task.recorder.push(recorderItem);
  }

  private markTaskAsPending(task: ExecutionTaskApply): ExecutionTask {
    return {
      taskId: uuid(),
      status: 'pending',
      ...task,
    };
  }

  private normalizeStatusFromError(
    options?: TaskRunnerOperationOptions,
    errorMessage?: string,
  ): void {
    if (this.status !== 'error') {
      return;
    }
    assert(
      options?.allowWhenError,
      errorMessage ||
        `task runner is in error state, cannot proceed\nerror=${this.latestErrorTask()?.error}\n${this.latestErrorTask()?.errorStack}`,
    );
    // reset runner state so new tasks can run
    this.status = this.tasks.length > 0 ? 'pending' : 'init';
  }

  private findPreviousNonSubTaskUIContext(
    currentIndex: number,
  ): UIContext | undefined {
    for (let i = currentIndex - 1; i >= 0; i--) {
      const candidate = this.tasks[i];
      if (!candidate || candidate.subTask) {
        continue;
      }
      if (candidate.uiContext) {
        return candidate.uiContext;
      }
    }
    return undefined;
  }

  async append(
    task: ExecutionTaskApply[] | ExecutionTaskApply,
    options?: TaskRunnerOperationOptions,
  ): Promise<void> {
    this.normalizeStatusFromError(
      options,
      `task runner is in error state, cannot append task\nerror=${this.latestErrorTask()?.error}\n${this.latestErrorTask()?.errorStack}`,
    );
    if (Array.isArray(task)) {
      this.tasks.push(...task.map((item) => this.markTaskAsPending(item)));
    } else {
      this.tasks.push(this.markTaskAsPending(task));
    }
    if (this.status !== 'running') {
      this.status = 'pending';
    }
    await this.emitOnTaskUpdate();
  }

  async appendAndFlush(
    task: ExecutionTaskApply[] | ExecutionTaskApply,
    options?: TaskRunnerOperationOptions,
  ): Promise<{ output: any; thought?: string } | undefined> {
    await this.append(task, options);
    return this.flush(options);
  }

  async flush(
    options?: TaskRunnerOperationOptions,
  ): Promise<{ output: any; thought?: string } | undefined> {
    if (this.status === 'init' && this.tasks.length > 0) {
      console.warn(
        'illegal state for task runner, status is init but tasks are not empty',
      );
    }

    this.normalizeStatusFromError(options, 'task runner is in error state');
    assert(this.status !== 'running', 'task runner is already running');
    assert(this.status !== 'completed', 'task runner is already completed');

    const nextPendingIndex = this.tasks.findIndex(
      (task) => task.status === 'pending',
    );
    if (nextPendingIndex < 0) {
      // all tasks are completed
      return;
    }

    this.status = 'running';
    await this.emitOnTaskUpdate();
    let taskIndex = nextPendingIndex;
    let successfullyCompleted = true;

    let previousFindOutput: ExecutionTaskPlanningLocateOutput | undefined;

    while (taskIndex < this.tasks.length) {
      // Check if the operation has been aborted
      if (options?.signal?.aborted) {
        // Mark all remaining tasks as cancelled
        for (let i = taskIndex; i < this.tasks.length; i++) {
          this.tasks[i].status = 'cancelled';
        }
        this.status = 'error';
        await this.emitOnTaskUpdate();
        throw new MidsceneAbortedError(options.signal.reason);
      }

      const task = this.tasks[taskIndex];
      assert(
        task.status === 'pending',
        `task status should be pending, but got: ${task.status}`,
      );
      task.timing = {
        start: Date.now(),
      };
      try {
        task.status = 'running';
        await this.emitOnTaskUpdate();
        try {
          if (this.onTaskStart) {
            await this.onTaskStart(task);
          }
        } catch (e) {
          console.error('error in onTaskStart', e);
        }
        assert(
          ['Insight', 'Action Space', 'Planning'].indexOf(task.type) >= 0,
          `unsupported task type: ${task.type}`,
        );

        const { executor, param } = task;
        assert(executor, `executor is required for task type: ${task.type}`);

        let returnValue;
        let uiContext: UIContext | undefined;
        if (task.subTask) {
          uiContext = this.findPreviousNonSubTaskUIContext(taskIndex);
          assert(
            uiContext,
            'subTask requires uiContext from previous non-subTask task',
          );
        } else {
          // For Insight tasks (Query/Assert/WaitFor), always get fresh context
          // to ensure we have the latest UI state after any preceding actions
          const forceRefresh = task.type === 'Insight';
          uiContext = await this.getUiContext({ forceRefresh });
        }
        task.uiContext = uiContext;
        const executorContext: ExecutorContext = {
          task,
          element: previousFindOutput?.element,
          uiContext,
        };

        if (task.type === 'Insight') {
          assert(
            task.subType === 'Query' ||
              task.subType === 'Assert' ||
              task.subType === 'WaitFor' ||
              task.subType === 'Boolean' ||
              task.subType === 'Number' ||
              task.subType === 'String',
            `unsupported service subType: ${task.subType}`,
          );
          returnValue = await task.executor(param, executorContext);
        } else if (task.type === 'Planning') {
          returnValue = await task.executor(param, executorContext);
          if (task.subType === 'Locate') {
            previousFindOutput = (
              returnValue as ExecutionTaskReturn<ExecutionTaskPlanningLocateOutput>
            )?.output;
          }
        } else if (task.type === 'Action Space') {
          returnValue = await task.executor(param, executorContext);
        } else {
          console.warn(
            `unsupported task type: ${task.type}, will try to execute it directly`,
          );
          returnValue = await task.executor(param, executorContext);
        }

        const isLastTask = taskIndex === this.tasks.length - 1;

        if (isLastTask) {
          const screenshot = await this.captureScreenshot();
          this.attachRecorderItem(task, screenshot, 'after-calling');
        }

        Object.assign(task, returnValue);
        task.status = 'finished';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
        await this.emitOnTaskUpdate();
        taskIndex++;
      } catch (e: any) {
        successfullyCompleted = false;
        task.error = e;
        task.errorMessage =
          e?.message || (typeof e === 'string' ? e : 'error-without-message');
        task.errorStack = e.stack;

        task.status = 'failed';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
        await this.emitOnTaskUpdate();
        break;
      }
    }

    // set all remaining tasks as cancelled
    for (let i = taskIndex + 1; i < this.tasks.length; i++) {
      this.tasks[i].status = 'cancelled';
    }
    if (taskIndex + 1 < this.tasks.length) {
      await this.emitOnTaskUpdate();
    }

    let finalizeError: TaskExecutionError | undefined;
    if (!successfullyCompleted) {
      this.status = 'error';
      const errorTask = this.latestErrorTask();
      const messageBase =
        errorTask?.errorMessage ||
        (errorTask?.error ? String(errorTask.error) : 'Task execution failed');
      const stack = errorTask?.errorStack;
      const message = stack ? `${messageBase}\n${stack}` : messageBase;
      finalizeError = new TaskExecutionError(message, this, errorTask, {
        cause: errorTask?.error,
      });
      await this.emitOnTaskUpdate(finalizeError);
    } else {
      this.status = 'completed';
      await this.emitOnTaskUpdate();
    }

    if (finalizeError) {
      throw finalizeError;
    }

    if (this.tasks.length) {
      // return the last output
      const outputIndex = Math.min(taskIndex, this.tasks.length - 1);
      const { thought, output } = this.tasks[outputIndex];
      return {
        thought,
        output,
      };
    }
  }

  isInErrorState(): boolean {
    return this.status === 'error';
  }

  latestErrorTask(): ExecutionTask | null {
    if (this.status !== 'error') {
      return null;
    }
    // Find the LAST failed task (not the first one)
    // This is important when using allowWhenError to continue after errors
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].status === 'failed') {
        return this.tasks[i];
      }
    }
    return null;
  }

  dump(): ExecutionDump {
    return new ExecutionDump({
      logTime: Date.now(),
      name: this.name,
      tasks: this.tasks,
    });
  }

  async appendErrorPlan(errorMsg: string): Promise<{
    output: undefined;
    runner: TaskRunner;
  }> {
    const errorTask: ExecutionTaskActionApply<PlanningActionParamError> = {
      type: 'Action Space',
      subType: 'Error',
      param: {
        thought: errorMsg,
      },
      thought: errorMsg,
      executor: async () => {
        throw new Error(errorMsg || 'error without thought');
      },
    };
    await this.appendAndFlush(errorTask);

    return {
      output: undefined,
      runner: this,
    };
  }
}

export class TaskExecutionError extends Error {
  runner: TaskRunner;

  errorTask: ExecutionTask | null;

  constructor(
    message: string,
    runner: TaskRunner,
    errorTask: ExecutionTask | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.runner = runner;
    this.errorTask = errorTask;
  }
}

/**
 * Error thrown when an operation is aborted via an AbortSignal.
 */
export class MidsceneAbortedError extends Error {
  override name = 'MidsceneAbortedError';

  constructor(reason?: unknown) {
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'The operation was aborted';
    super(message, reason instanceof Error ? { cause: reason } : undefined);
  }
}
