import assert from 'node:assert';
import { MIDSCENE_MODEL_NAME, getAIConfig } from '@/env';
import type {
  ExecutionDump,
  ExecutionTask,
  ExecutionTaskApply,
  ExecutionTaskInsightLocateOutput,
  ExecutionTaskProgressOptions,
  ExecutionTaskReturn,
  ExecutorContext,
} from '@/types';
import { getVersion } from '@/utils';

export class Executor {
  name: string;

  description?: string;

  tasks: ExecutionTask[];

  // status of executor
  status: 'init' | 'pending' | 'running' | 'completed' | 'error';

  onTaskStart?: ExecutionTaskProgressOptions['onTaskStart'];

  constructor(
    name: string,
    description?: string,
    tasks?: ExecutionTaskApply[],
    options?: ExecutionTaskProgressOptions,
  ) {
    this.status = tasks && tasks.length > 0 ? 'pending' : 'init';
    this.name = name;
    this.description = description;
    this.tasks = (tasks || []).map((item) => this.markTaskAsPending(item));
    this.onTaskStart = options?.onTaskStart;
  }

  private markTaskAsPending(task: ExecutionTaskApply): ExecutionTask {
    return {
      status: 'pending',
      ...task,
    };
  }

  async append(task: ExecutionTaskApply[] | ExecutionTaskApply): Promise<void> {
    assert(
      this.status !== 'error',
      `executor is in error state, cannot append task\nerror=${this.latestErrorTask()?.error}\n${this.latestErrorTask()?.errorStack}`,
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

  async flush(): Promise<any> {
    if (this.status === 'init' && this.tasks.length > 0) {
      console.warn(
        'illegal state for executor, status is init but tasks are not empty',
      );
    }

    assert(this.status !== 'running', 'executor is already running');
    assert(this.status !== 'completed', 'executor is already completed');
    assert(this.status !== 'error', 'executor is in error state');

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
          // console.error('error in onTaskStart', e);
        }
        assert(
          ['Insight', 'Action', 'Planning'].indexOf(task.type) >= 0,
          `unsupported task type: ${task.type}`,
        );

        const { executor, param } = task;
        assert(executor, `executor is required for task type: ${task.type}`);

        let returnValue;
        const executorContext: ExecutorContext = {
          task,
          element: previousFindOutput?.element,
        };
        if (task.type === 'Insight') {
          assert(
            task.subType === 'Locate' ||
              task.subType === 'Query' ||
              task.subType === 'Assert',
            `unsupported insight subType: ${task.subType}`,
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

        Object.assign(task, returnValue);
        task.status = 'finished';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
        taskIndex++;
      } catch (e: any) {
        successfullyCompleted = false;
        task.error = e?.message || 'error-without-message';
        task.errorStack = e.stack;

        task.status = 'failed';
        task.timing.end = Date.now();
        task.timing.cost = task.timing.end - task.timing.start;
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
      return this.tasks[outputIndex].output;
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
      sdkVersion: getVersion(),
      model_name: getAIConfig(MIDSCENE_MODEL_NAME) || '',
      logTime: Date.now(),
      name: this.name,
      description: this.description,
      tasks: this.tasks,
    };
    return dumpData;
  }
}
