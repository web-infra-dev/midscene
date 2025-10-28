import type {
  ExecutionDump,
  ExecutionRecorderItem,
  ExecutionTask,
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskInsightLocateOutput,
  ExecutionTaskProgressOptions,
  ExecutionTaskReturn,
  ExecutorContext,
  PlanningActionParamError,
  UIContext,
} from '@/types';
import { assert } from '@midscene/shared/utils';

export class TaskRunner {
  name: string;

  tasks: ExecutionTask[];

  // status of runner
  status: 'init' | 'pending' | 'running' | 'completed' | 'error';

  onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];

  private readonly uiContextBuilder: () => Promise<UIContext>;

  private lastCapturedScreenshot?: string;

  constructor(
    name: string,
    uiContextBuilder: () => Promise<UIContext>,
    options?: ExecutionTaskProgressOptions & {
      tasks?: ExecutionTaskApply[];
    },
  ) {
    this.status =
      options?.tasks && options.tasks.length > 0 ? 'pending' : 'init';
    this.name = name;
    this.tasks = (options?.tasks || []).map((item) =>
      this.markTaskAsPending(item),
    );
    this.onTaskStart = options?.onTaskStart;
    this.uiContextBuilder = uiContextBuilder;
  }

  private async captureScreenshot(): Promise<string | undefined> {
    try {
      const uiContext = await this.uiContextBuilder();
      return uiContext?.screenshotBase64;
    } catch (error) {
      console.error('error while capturing screenshot', error);
    }
    return undefined;
  }

  private attachRecorderItem(
    task: ExecutionTask,
    contextOrScreenshot: UIContext | string | undefined,
    phase: 'before' | 'after',
  ): void {
    const timing = phase;
    const screenshot =
      typeof contextOrScreenshot === 'string'
        ? contextOrScreenshot
        : contextOrScreenshot?.screenshotBase64;
    if (!timing || !screenshot) {
      return;
    }

    const recorderItem: ExecutionRecorderItem = {
      type: 'screenshot',
      ts: Date.now(),
      screenshot,
      timing,
    };

    if (!task.recorder) {
      task.recorder = [recorderItem];
      return;
    }
    task.recorder.push(recorderItem);
  }

  private markTaskAsPending(task: ExecutionTaskApply): ExecutionTask {
    return {
      status: 'pending',
      ...task,
    };
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

  async append(task: ExecutionTaskApply[] | ExecutionTaskApply): Promise<void> {
    assert(
      this.status !== 'error',
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
  }

  async appendAndFlush(
    task: ExecutionTaskApply[] | ExecutionTaskApply,
  ): Promise<{ output: any; thought?: string } | undefined> {
    await this.append(task);
    return this.flush();
  }

  async flush(): Promise<{ output: any; thought?: string } | undefined> {
    if (this.status === 'init' && this.tasks.length > 0) {
      console.warn(
        'illegal state for task runner, status is init but tasks are not empty',
      );
    }

    assert(this.status !== 'running', 'task runner is already running');
    assert(this.status !== 'completed', 'task runner is already completed');
    assert(this.status !== 'error', 'task runner is in error state');

    const nextPendingIndex = this.tasks.findIndex(
      (task) => task.status === 'pending',
    );
    if (nextPendingIndex < 0) {
      // all tasks are completed
      return;
    }

    this.status = 'running';
    let taskIndex = nextPendingIndex;
    let successfullyCompleted = true;

    let previousFindOutput: ExecutionTaskInsightLocateOutput | undefined;

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
        try {
          if (this.onTaskStart) {
            await this.onTaskStart(task);
          }
        } catch (e) {
          console.error('error in onTaskStart', e);
        }
        assert(
          ['Insight', 'Action', 'Planning'].indexOf(task.type) >= 0,
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
          uiContext = await this.uiContextBuilder();
        }
        task.uiContext = uiContext;

        // Capture "before" screenshot for non-subTask tasks
        if (!task.subTask) {
          const isFirstNonSubTask =
            taskIndex === 0 ||
            this.tasks.slice(0, taskIndex).every((t) => t.subTask);

          if (isFirstNonSubTask) {
            // First non-subTask: capture a fresh "before" screenshot
            this.attachRecorderItem(task, uiContext, 'before');
          } else if (this.lastCapturedScreenshot) {
            // Subsequent non-subTasks: reuse previous task's "after" screenshot
            this.attachRecorderItem(
              task,
              this.lastCapturedScreenshot,
              'before',
            );
          } else {
            // Fallback: if no cached screenshot exists, use current uiContext
            this.attachRecorderItem(task, uiContext, 'before');
          }
        }

        const executorContext: ExecutorContext = {
          task,
          element: previousFindOutput?.element,
          uiContext,
        };

        if (task.type === 'Insight') {
          assert(
            task.subType === 'Locate' ||
              task.subType === 'Query' ||
              task.subType === 'Assert' ||
              task.subType === 'WaitFor' ||
              task.subType === 'Boolean' ||
              task.subType === 'Number' ||
              task.subType === 'String',
            `unsupported service subType: ${task.subType}`,
          );
          returnValue = await task.executor(param, executorContext);
          if (task.subType === 'Locate') {
            previousFindOutput = (
              returnValue as ExecutionTaskReturn<ExecutionTaskInsightLocateOutput>
            )?.output;
          }
        } else if (task.type === 'Action' || task.type === 'Planning') {
          returnValue = await task.executor(param, executorContext);
        } else {
          console.warn(
            `unsupported task type: ${task.type}, will try to execute it directly`,
          );
          returnValue = await task.executor(param, executorContext);
        }

        // Capture "after" screenshot for all non-subTask tasks
        if (!task.subTask) {
          const screenshot = await this.captureScreenshot();
          this.attachRecorderItem(task, screenshot, 'after');
          // Store for reuse as next task's "before" screenshot
          this.lastCapturedScreenshot = screenshot;
        }

        Object.assign(task, returnValue);
        task.status = 'finished';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
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

        // Clear cached screenshot on error to avoid stale state
        this.lastCapturedScreenshot = undefined;
        break;
      }
    }

    // set all remaining tasks as cancelled
    for (let i = taskIndex + 1; i < this.tasks.length; i++) {
      this.tasks[i].status = 'cancelled';
    }

    if (successfullyCompleted) {
      this.status = 'completed';
    } else {
      this.status = 'error';
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
    const errorTaskIndex = this.tasks.findIndex(
      (task) => task.status === 'failed',
    );
    if (errorTaskIndex >= 0) {
      return this.tasks[errorTaskIndex];
    }
    return null;
  }

  dump(): ExecutionDump {
    const dumpData: ExecutionDump = {
      logTime: Date.now(),
      name: this.name,
      tasks: this.tasks,
    };
    return dumpData;
  }

  async appendErrorPlan(errorMsg: string): Promise<{
    output: undefined;
    runner: TaskRunner;
  }> {
    const errorTask: ExecutionTaskActionApply<PlanningActionParamError> = {
      type: 'Action',
      subType: 'Error',
      param: {
        thought: errorMsg,
      },
      thought: errorMsg,
      locate: null,
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
