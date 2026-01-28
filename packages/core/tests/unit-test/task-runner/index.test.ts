import { ScreenshotItem, TaskRunner } from '@/index';
import type {
  ExecutionTaskActionApply,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningLocateApply,
  UIContext,
} from '@/index';
import { fakeService } from 'tests/utils';
import { describe, expect, it, vi } from 'vitest';

const insightFindTask = (shouldThrow?: boolean) => {
  const insightFindTask: ExecutionTaskPlanningLocateApply = {
    type: 'Planning',
    subType: 'Locate',
    param: {
      prompt: 'test',
    },
    async executor(param, taskContext) {
      if (shouldThrow) {
        const { task } = taskContext;
        task.output = 'error-output';
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('test-error');
      }
      const insight = await fakeService('test-task-runner');
      const { element, dump: insightDump } = await insight.locate(
        {
          prompt: param.prompt,
        },
        {},
        {
          modelName: 'mock-model',
          modelDescription: 'mock-model-description',
          intent: 'default',
        },
      );
      return {
        output: {
          element,
        },
        log: insightDump,
        cache: {
          hit: false,
        },
      };
    },
  };
  return insightFindTask;
};

const fakeUIContextBuilder = async () => {
  const screenshot = ScreenshotItem.create('');
  return {
    screenshot,
    tree: { node: null, children: [] },
    size: { width: 0, height: 0 },
  } as unknown as UIContext;
};

describe(
  'task-runner',
  {
    timeout: 1000 * 60 * 3,
  },
  () => {
    it('insight - basic run', async () => {
      const insightTask1 = insightFindTask();
      const flushResultData = 'abcdef';
      const taskParam = {
        action: 'tap',
        anything: 'acceptable',
      };
      const tapperFn = vi.fn();
      const actionTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        param: taskParam,
        executor: tapperFn,
      };
      const actionTask2: ExecutionTaskActionApply = {
        type: 'Action Space',
        param: taskParam,
        executor: async () => {
          return {
            output: flushResultData,
          } as any;
        },
      };

      const inputTasks = [insightTask1, actionTask, actionTask2];

      const runner = new TaskRunner('test', fakeUIContextBuilder, {
        tasks: inputTasks,
      });
      const flushResult = await runner.flush();
      const tasks = runner.tasks as ExecutionTaskPlanningLocate[];
      expect(runner.isInErrorState()).toBeFalsy();
      const { element } = tasks[0].output || {};
      expect(element).toBeTruthy();

      expect(tasks.length).toBe(inputTasks.length);
      expect(tasks[0].status).toBe('finished');
      // expect(tasks[0].output).toMatchSnapshot();
      expect(tasks[0].log).toBeTruthy();
      expect(tasks[0].timing?.end).toBeTruthy();
      expect(tasks[0].hitBy?.from).not.toBe('Cache');

      expect(tapperFn).toBeCalledTimes(1);
      expect(tapperFn.mock.calls[0][0]).toBe(taskParam);
      expect(tapperFn.mock.calls[0][1].task).toBeTruthy();

      const dump = runner.dump();
      expect(dump.logTime).toBeTruthy();

      expect(flushResult?.output).toBe(flushResultData);
    });

    it('insight - init and append', async () => {
      const initRunner = new TaskRunner('test', fakeUIContextBuilder);
      expect(initRunner.status).toBe('init');
      const tapperFn = vi.fn();

      const insightTask1 = insightFindTask();
      const actionTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        param: {
          action: 'tap',
          element: 'previous',
        },
        executor: async () => {
          // delay 500
          await new Promise((resolve) => setTimeout(resolve, 500));
          tapperFn();
        },
      };

      initRunner.append(insightTask1);
      initRunner.append(actionTask);
      expect(initRunner.status).toBe('pending');
      expect(initRunner.tasks.length).toBe(2);
      expect(tapperFn).toBeCalledTimes(0);

      const dumpContent1 = initRunner.dump();
      expect(dumpContent1.tasks.length).toBe(2);

      // append while running
      const output = await Promise.all([
        initRunner.flush(),
        (async () => {
          // sleep 200ms
          expect(initRunner.status).toBe('running');
          await new Promise((resolve) => setTimeout(resolve, 200));
          initRunner.append(actionTask);
          expect(initRunner.status).toBe('running');
        })(),
      ]);

      expect(initRunner.status).toBe('completed');
      expect(initRunner.tasks.length).toBe(3);
      expect(initRunner.tasks[2].status).toBe('finished');

      // append while completed
      initRunner.append(actionTask);
      expect(initRunner.status).toBe('pending');

      // same dumpPath to append
      const dumpContent2 = initRunner.dump();
      expect(dumpContent2.tasks.length).toBe(4);

      expect(initRunner.latestErrorTask()).toBeFalsy();
    });

    it('insight - run with error', async () => {
      const runner = new TaskRunner('test', fakeUIContextBuilder, {
        tasks: [insightFindTask(true), insightFindTask()],
      });
      // expect to throw an error
      await expect(runner.flush()).rejects.toThrowError();
      const tasks = runner.tasks as ExecutionTaskInsightLocate[];

      expect(tasks.length).toBe(2);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].error).toBeTruthy();
      expect(tasks[0].timing!.end).toBeTruthy();
      expect(tasks[1].status).toBe('cancelled');
      expect(runner.status).toBe('error');
      expect(runner.latestErrorTask()).toBeTruthy();
      expect(runner.isInErrorState()).toBeTruthy();

      await expect(async () => {
        await runner.append(insightFindTask());
      }).rejects.toThrowError();
    });

    it('allows append and flush when recovering from error', async () => {
      const runner = new TaskRunner('recoverable', fakeUIContextBuilder, {
        tasks: [insightFindTask(true)],
      });

      await expect(runner.flush()).rejects.toThrowError();
      expect(runner.status).toBe('error');

      const recoveryExecutor = vi.fn().mockResolvedValue({
        output: 'recovered',
      });
      const recoveryTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: recoveryExecutor,
      };

      await expect(runner.append(recoveryTask)).rejects.toThrowError();

      await runner.append(recoveryTask, { allowWhenError: true });
      expect(runner.status).toBe('pending');

      const flushResult = await runner.flush({ allowWhenError: true });
      expect(runner.status).toBe('completed');
      expect(recoveryExecutor).toHaveBeenCalledTimes(1);
      expect(flushResult?.output).toBe('recovered');
    });

    it('subTask - reuse previous uiContext', async () => {
      const baseUIContext = async (id: string) => {
        const screenshot = ScreenshotItem.create(id);
        return {
          screenshot,
          tree: { node: null, children: [] },
          size: { width: 0, height: 0 },
        } as unknown as UIContext;
      };

      const firstContext = await baseUIContext('first');
      const screenshotContext = await baseUIContext('screenshot');
      const uiContextBuilder = vi
        .fn<[], Promise<UIContext>>()
        .mockResolvedValueOnce(firstContext)
        .mockResolvedValueOnce(screenshotContext);

      const recordedContexts: UIContext[] = [];

      const runner = new TaskRunner('sub-task-test', uiContextBuilder, {
        tasks: [
          {
            type: 'Action Space',
            executor: async (_, context) => {
              recordedContexts.push(context.uiContext!);
            },
          },
          {
            type: 'Action Space',
            subTask: true,
            executor: async (_, context) => {
              recordedContexts.push(context.uiContext!);
            },
          },
        ],
      });

      await runner.flush();

      expect(recordedContexts).toHaveLength(2);
      expect(recordedContexts[0]).toBe(firstContext);
      expect(recordedContexts[1]).toBe(firstContext);
      expect(runner.tasks[0].uiContext).toBe(firstContext);
      expect(runner.tasks[1].uiContext).toBe(firstContext);
      expect(uiContextBuilder).toHaveBeenCalledTimes(2);
    });

    it('subTask - throws when previous uiContext missing', async () => {
      const uiContextBuilder = vi
        .fn<[], Promise<UIContext>>()
        .mockImplementation(
          async () =>
            ({
              screenshot: ScreenshotItem.create(''),
              tree: { node: null, children: [] },
              size: { width: 0, height: 0 },
            }) as unknown as UIContext,
        );

      const runner = new TaskRunner('sub-task-error', uiContextBuilder, {
        tasks: [
          {
            type: 'Action Space',
            subTask: true,
            executor: vi.fn(),
          },
        ],
      });

      await expect(runner.flush()).rejects.toThrowError(
        'subTask requires uiContext from previous non-subTask task',
      );
      expect(runner.status).toBe('error');
      expect(runner.tasks[0].errorMessage).toBe(
        'subTask requires uiContext from previous non-subTask task',
      );
      await expect(runner.flush()).rejects.toThrowError(
        'task runner is in error state',
      );
    });

    it('error message should be from the last failed task when using allowWhenError', async () => {
      const runner = new TaskRunner('error-message-test', fakeUIContextBuilder);

      // First task - will fail with "first-error"
      const firstTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: async () => {
          throw new Error('first-error');
        },
      };

      // Second task - will succeed
      const secondTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: async () => {
          return { output: 'success' };
        },
      };

      // Third task - will fail with "third-error"
      const thirdTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: async () => {
          throw new Error('third-error');
        },
      };

      // Add first task and let it fail
      await runner.append(firstTask);
      await expect(runner.flush()).rejects.toThrowError('first-error');
      expect(runner.status).toBe('error');
      expect(runner.tasks[0].status).toBe('failed');

      // Continue with allowWhenError, add second task (success)
      await runner.append(secondTask, { allowWhenError: true });
      await runner.flush({ allowWhenError: true });
      expect(runner.status).toBe('completed');
      expect(runner.tasks[1].status).toBe('finished');

      // Add third task and let it fail
      await runner.append(thirdTask);
      let caughtError: Error | undefined;
      try {
        await runner.flush();
      } catch (error) {
        caughtError = error as Error;
      }

      // The error message should be from the LAST failed task (third-error), not the first one
      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toContain('third-error');
      expect(caughtError?.message).not.toContain('first-error');
      expect(runner.tasks[2].status).toBe('failed');
      expect(runner.tasks[2].errorMessage).toBe('third-error');

      // latestErrorTask should return the third task, not the first one
      const latestError = runner.latestErrorTask();
      expect(latestError).toBe(runner.tasks[2]);
      expect(latestError?.errorMessage).toBe('third-error');
    });
  },
);
