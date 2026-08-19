import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem, TaskRunner } from '@/index';
import type {
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningLocateApply,
  UIContext,
} from '@/index';
import Service from '@/service';
import { TaskExecutionError } from '@/task-runner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processError } from 'vitest/browser';
import { createFakeContext } from '../../utils';

// Mock AI service caller
vi.mock('@/ai-model/service-caller/index', () => ({
  callAI: vi.fn(),
  parseAIObjectResponse: vi.fn(),
  AIResponseParseError: class AIResponseParseError extends Error {},
}));

import { callAI, parseAIObjectResponse } from '@/ai-model/service-caller/index';

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
      const context = createFakeContext();
      const service = new Service(context);
      const { element, dump: insightDump } = await service.locate(
        {
          prompt: param.prompt,
        },
        {},
        getModelRuntime({
          modelName: 'mock-model',
          modelFamily: 'qwen2.5-vl',
          modelDescription: 'mock-model-description',
          intent: 'default',
          slot: 'default',
        }),
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
  const screenshot = ScreenshotItem.create('', Date.now());
  return {
    screenshot,
    tree: { node: null, children: [] },
    shotSize: { width: 0, height: 0 },
    shrunkShotToLogicalRatio: 1,
  } as unknown as UIContext;
};

describe(
  'task-runner',
  {
    timeout: 1000 * 60 * 3,
  },
  () => {
    beforeEach(() => {
      // Setup default mock implementation for AI calls
      vi.mocked(callAI).mockResolvedValue({ content: '{}', isStreamed: false });
      vi.mocked(parseAIObjectResponse).mockReturnValue({
        content: {
          bbox: [0, 0, 100, 100] as [number, number, number, number],
          errors: [],
        },
        contentString: JSON.stringify({
          bbox: [0, 0, 100, 100],
          errors: [],
        }),
        usage: undefined,
      });
    });

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
      const actionTask2: ExecutionTaskApply<'Action Space', any, string, void> =
        {
          type: 'Action Space',
          param: taskParam,
          executor: async () => {
            return {
              output: flushResultData,
            };
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
      const recoveryTask: ExecutionTaskApply<
        'Action Space',
        any,
        string,
        void
      > = {
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

    it('reuses UI context before an action and invalidates it after the action settles', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const uiContextBuilder = vi.fn(fakeUIContextBuilder);
      const tasks: ExecutionTaskApply[] = [
        {
          type: 'Planning',
          subType: 'Plan',
          executor: async () => {},
        },
        {
          type: 'Action Space',
          executor: async () => {},
        },
        {
          type: 'Planning',
          subType: 'Plan',
          executor: async () => {},
        },
      ];

      try {
        const runner = new TaskRunner(
          'action-cache-boundary',
          uiContextBuilder,
          {
            tasks,
          },
        );
        await runner.flush();

        expect(runner.tasks[1].uiContext).toBe(runner.tasks[0].uiContext);
        expect(runner.tasks[2].uiContext).not.toBe(runner.tasks[1].uiContext);
        expect(uiContextBuilder).toHaveBeenCalledTimes(3);
      } finally {
        now.mockRestore();
      }
    });

    it('invalidates UI context when an action throws', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
      const uiContextBuilder = vi.fn(fakeUIContextBuilder);
      const failedAction: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: async () => {
          throw new Error('partial-action-failure');
        },
      };
      const recoveryTask: ExecutionTaskApply = {
        type: 'Planning',
        subType: 'Plan',
        executor: async () => {},
      };

      try {
        const runner = new TaskRunner(
          'failed-action-cache-boundary',
          uiContextBuilder,
          {
            tasks: [failedAction],
          },
        );
        await expect(runner.flush()).rejects.toThrow('partial-action-failure');

        await runner.append(recoveryTask, { allowWhenError: true });
        await runner.flush({ allowWhenError: true });

        expect(runner.tasks[1].uiContext).not.toBe(runner.tasks[0].uiContext);
        expect(uiContextBuilder).toHaveBeenCalledTimes(3);
      } finally {
        now.mockRestore();
      }
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
      const secondTask: ExecutionTaskApply<'Action Space', any, string, void> =
        {
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

    it('serializes task execution errors without the runtime execution graph', async () => {
      const runner = new TaskRunner(
        'error-serialization-test',
        fakeUIContextBuilder,
      );
      const rootCause = Object.assign(new TypeError('socket closed'), {
        code: 'ECONNRESET',
      });
      const originalError = {
        error: {
          message: 'upstream failed',
          ignoredObject: { shouldNotBeSerialized: true },
        },
        cause: rootCause,
        status: 503,
        requestID: 'request-123',
      };

      await runner.append({
        type: 'Action Space',
        subType: 'Tap',
        executor: async () => {
          throw originalError;
        },
      });

      let caughtError: TaskExecutionError | undefined;
      try {
        await runner.flush();
      } catch (error) {
        caughtError = error as TaskExecutionError;
      }

      expect(caughtError).toBeInstanceOf(TaskExecutionError);
      expect(caughtError?.name).toBe('TaskExecutionError');
      expect(caughtError?.message).toBe('upstream failed');
      expect(caughtError?.cause).toBe(originalError);
      expect(caughtError?.runner).toBe(runner);
      expect(caughtError?.errorTask).toBe(runner.latestErrorTask());
      expect(caughtError?.errorTask?.errorStack).toBeUndefined();

      const serializedError = processError(caughtError);
      expect(serializedError).toEqual({
        name: 'TaskExecutionError',
        message: 'upstream failed',
        stack: expect.stringContaining('TaskExecutionError: upstream failed'),
        cause: {
          name: 'Error',
          message: 'upstream failed',
          status: 503,
          requestID: 'request-123',
          cause: {
            name: 'TypeError',
            message: 'socket closed',
            stack: expect.stringContaining('TypeError: socket closed'),
            code: 'ECONNRESET',
          },
        },
        task: {
          taskId: caughtError?.errorTask?.taskId,
          type: 'Action Space',
          subType: 'Tap',
          status: 'failed',
          errorMessage: 'upstream failed',
        },
      });
      const serializedText = JSON.stringify(serializedError);
      expect(serializedText).not.toContain('Function<');
      expect(serializedError).not.toHaveProperty('runner');
      expect(serializedError).not.toHaveProperty('errorTask');
      expect(serializedError.task).not.toHaveProperty('executor');
      expect(serializedText).not.toContain('ignoredObject');
    });
  },
);
