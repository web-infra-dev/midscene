import type { ScreenshotItem } from '@/screenshot-item';
import { setTimingFieldOnce } from '@/task-timing';
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

/**
 * A native, per-task lifecycle notification. The runner is the single source
 * of truth for when a task actually transitions, so it reports each transition
 * exactly once with the task that changed. Consumers no longer have to re-scan
 * the task list and diff it against remembered keys to reconstruct this stream.
 */
export type TaskRunnerEventKind =
  | 'append'
  | 'start'
  | 'finish'
  | 'error'
  | 'cancel';

export interface TaskRunnerEvent {
  kind: TaskRunnerEventKind;
  task: ExecutionTask;
  runner: TaskRunner;
}

export type TaskRunnerEventListener = (
  event: TaskRunnerEvent,
) => Promise<void> | void;

type TaskRunnerInitOptions = ExecutionTaskProgressOptions & {
  tasks?: ExecutionTaskApply[];
  /**
   * Coarse "the execution snapshot changed" signal. Fires on any state change
   * (append, status flips, completion) with the whole runner, so consumers can
   * re-dump/re-render the current snapshot. Deliberately batch-granular, unlike
   * the per-task {@link onTaskEvent} stream.
   */
  onSnapshotChange?: (
    runner: TaskRunner,
    error?: TaskExecutionError,
  ) => Promise<void> | void;
  onTaskEvent?: TaskRunnerEventListener;
};

type TaskRunnerOperationOptions = {
  allowWhenError?: boolean;
};

export class TaskRunner {
  readonly id: string;
  name: string;

  tasks: ExecutionTask[];

  // status of runner
  status: 'init' | 'pending' | 'running' | 'completed' | 'error';

  onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];

  private readonly uiContextBuilder: () => Promise<UIContext>;

  private readonly onSnapshotChange?:
    | ((runner: TaskRunner, error?: TaskExecutionError) => Promise<void> | void)
    | undefined;

  private readonly onTaskEvent?: TaskRunnerEventListener | undefined;

  private readonly executionLogTime: number;

  constructor(
    name: string,
    uiContextBuilder: () => Promise<UIContext>,
    options?: TaskRunnerInitOptions,
  ) {
    this.id = uuid();
    this.status =
      options?.tasks && options.tasks.length > 0 ? 'pending' : 'init';
    this.name = name;
    this.tasks = (options?.tasks || []).map((item) =>
      this.markTaskAsPending(item),
    );
    this.onTaskStart = options?.onTaskStart;
    this.uiContextBuilder = uiContextBuilder;
    this.onSnapshotChange = options?.onSnapshotChange;
    this.onTaskEvent = options?.onTaskEvent;
    this.executionLogTime = Date.now();
  }

  private async emitSnapshotChange(error?: TaskExecutionError): Promise<void> {
    if (!this.onSnapshotChange) {
      return;
    }
    await this.onSnapshotChange(this, error);
  }

  private async emitTaskEvent(
    kind: TaskRunnerEventKind,
    task: ExecutionTask,
  ): Promise<void> {
    if (!this.onTaskEvent) {
      return;
    }
    try {
      await this.onTaskEvent({ kind, task, runner: this });
    } catch (error) {
      console.error('Error in onTaskEvent listener', error);
    }
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

  async append(
    task: ExecutionTaskApply[] | ExecutionTaskApply,
    options?: TaskRunnerOperationOptions,
  ): Promise<void> {
    this.normalizeStatusFromError(
      options,
      `task runner is in error state, cannot append task\nerror=${this.latestErrorTask()?.error}\n${this.latestErrorTask()?.errorStack}`,
    );
    const appended: ExecutionTask[] = [];
    if (Array.isArray(task)) {
      appended.push(...task.map((item) => this.markTaskAsPending(item)));
    } else {
      appended.push(this.markTaskAsPending(task));
    }
    this.tasks.push(...appended);
    if (this.status !== 'running') {
      this.status = 'pending';
    }
    await this.emitSnapshotChange();
    for (const appendedTask of appended) {
      await this.emitTaskEvent('append', appendedTask);
    }
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
    await this.emitSnapshotChange();
    let taskIndex = nextPendingIndex;
    let successfullyCompleted = true;

    let previousFindOutput: ExecutionTaskPlanningLocateOutput | undefined;

    while (taskIndex < this.tasks.length) {
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
        await this.emitSnapshotChange();
        await this.emitTaskEvent('start', task);
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
        // For Insight tasks (Query/Assert/WaitFor), always get fresh context
        // to ensure we have the latest UI state after any preceding actions
        const forceRefresh = task.type === 'Insight';
        setTimingFieldOnce(task.timing, 'getUiContextStart');
        const uiContext = await this.getUiContext({ forceRefresh });
        setTimingFieldOnce(task.timing, 'getUiContextEnd');

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
          setTimingFieldOnce(task.timing, 'captureAfterCallingSnapshotStart');
          const screenshot = await this.captureScreenshot();
          this.attachRecorderItem(task, screenshot, 'after-calling');
          setTimingFieldOnce(task.timing, 'captureAfterCallingSnapshotEnd');
        }

        Object.assign(task, returnValue);
        task.status = 'finished';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
        await this.emitSnapshotChange();
        await this.emitTaskEvent('finish', task);
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
        await this.emitSnapshotChange();
        await this.emitTaskEvent('error', task);
        break;
      }
    }

    // set all remaining tasks as cancelled
    const cancelledTasks: ExecutionTask[] = [];
    for (let i = taskIndex + 1; i < this.tasks.length; i++) {
      this.tasks[i].status = 'cancelled';
      cancelledTasks.push(this.tasks[i]);
    }
    if (cancelledTasks.length > 0) {
      await this.emitSnapshotChange();
      for (const cancelledTask of cancelledTasks) {
        await this.emitTaskEvent('cancel', cancelledTask);
      }
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
      await this.emitSnapshotChange(finalizeError);
    } else {
      this.status = 'completed';
      await this.emitSnapshotChange();
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
      id: this.id,
      logTime: this.executionLogTime,
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
