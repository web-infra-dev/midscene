import { getModelRuntime } from '@/ai-model/models';
import { ScreenshotItem, TaskRunner } from '@/index';
import type {
  ExecutionTaskActionApply,
  ExecutionTaskApply,
  ExecutionTaskInsightLocate,
  ExecutionTaskPlanningLocate,
  ExecutionTaskPlanningLocateApply,
  UIContext,
  UITreeSnapshot,
} from '@/index';
import Service from '@/service';
import { TaskExecutionError } from '@/task-runner';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createFakeContext } from '../../utils';

// Mock AI service caller
rs.mock('@/ai-model/service-caller/index', () => ({
  callAI: rs.fn(),
  AIResponseParseError: class AIResponseParseError extends Error {},
}));

import { callAI } from '@/ai-model/service-caller/index';

const insightFindTask = (shouldThrow?: boolean) => {
  const locateParam = {
    prompt: 'test',
  };
  const insightFindTask: ExecutionTaskPlanningLocateApply = {
    type: 'Planning',
    subType: 'Locate',
    param: locateParam,
    async executor(taskContext) {
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
          prompt: locateParam.prompt,
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
      rs.mocked(callAI).mockResolvedValue({
        content: JSON.stringify({
          bbox: [0, 0, 100, 100],
          errors: [],
        }),
        isStreamed: false,
      });
    });

    it('insight - basic run', async () => {
      const insightTask1 = insightFindTask();
      const flushResultData = 'abcdef';
      const taskParam = {
        action: 'tap',
        anything: 'acceptable',
      };
      const tapperFn = rs.fn();
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
      expect(tapperFn.mock.calls[0][0].task).toBeTruthy();
      expect(tasks[1].param).toBe(taskParam);

      const dump = runner.dump();
      expect(dump.logTime).toBeTruthy();

      expect(flushResult?.output).toBe(flushResultData);
    });

    it('stores a pruned tree only on Locate tasks and isolates context reuse', async () => {
      const uiTree: UITreeSnapshot = {
        platform: 'android',
        capturedAt: 1,
        root: {
          type: 'Window',
          attrs: {},
          bounds: { left: 0, top: 0, width: 200, height: 200 },
          children: [
            {
              type: 'Card',
              attrs: { 'resource-id': 'wallet-card' },
              bounds: { left: 10, top: 10, width: 100, height: 100 },
              children: [
                {
                  type: 'Button',
                  attrs: { 'resource-id': 'pay-button', text: 'Pay' },
                  bounds: { left: 20, top: 20, width: 40, height: 40 },
                  children: [
                    {
                      type: 'TextView',
                      attrs: { text: 'Pay' },
                      bounds: { left: 35, top: 35, width: 10, height: 10 },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      const contextBuilder = rs.fn<
        (task?: ExecutionTaskApply) => Promise<UIContext>
      >(async () => ({
        screenshot: ScreenshotItem.create('', Date.now()),
        shotSize: { width: 400, height: 400 },
        shrunkShotToLogicalRatio: 2,
        uiTree,
      }));
      const locateTask: ExecutionTaskPlanningLocateApply = {
        type: 'Planning',
        subType: 'Locate',
        param: { prompt: 'Pay' },
        executor: async () => ({
          output: {
            element: {
              center: [80, 80],
              rect: { left: 40, top: 40, width: 80, height: 80 },
              description: 'Pay',
            },
          },
        }),
      };
      const actionTask: ExecutionTaskActionApply = {
        type: 'Action Space',
        executor: async () => {},
      };
      const runner = new TaskRunner('tree-scope', contextBuilder, {
        tasks: [locateTask, actionTask],
      });

      await runner.flush();

      expect(runner.tasks[0].uiContext?.uiTree?.root).toMatchObject({
        type: 'Card',
        attrs: { 'resource-id': 'wallet-card' },
        children: [
          {
            type: 'Button',
            attrs: { 'resource-id': 'pay-button' },
            children: [],
          },
        ],
      });
      expect(runner.tasks[1].uiContext?.uiTree).toBeUndefined();
      expect(contextBuilder.mock.calls[0][0]).toMatchObject({
        type: 'Planning',
        subType: 'Locate',
      });
      expect(contextBuilder.mock.calls[1][0]).toMatchObject({
        type: 'Action Space',
      });
    });

    it('records an error when a captured tree cannot be mapped to the located element', async () => {
      const uiTree: UITreeSnapshot = {
        platform: 'android',
        capturedAt: 1,
        root: {
          type: 'Window',
          attrs: {},
          bounds: { left: 0, top: 0, width: 100, height: 100 },
          children: [],
        },
      };
      const contextBuilder = rs.fn(async () => ({
        screenshot: ScreenshotItem.create('', Date.now()),
        shotSize: { width: 400, height: 400 },
        shrunkShotToLogicalRatio: 2,
        uiTree,
      }));
      const locateTask: ExecutionTaskPlanningLocateApply = {
        type: 'Planning',
        subType: 'Locate',
        param: { prompt: 'Outside the tree' },
        executor: async () => ({
          output: {
            element: {
              center: [300, 300],
              rect: { left: 280, top: 280, width: 40, height: 40 },
              description: 'Outside the tree',
            },
          },
        }),
      };
      const runner = new TaskRunner('tree-mapping-error', contextBuilder, {
        tasks: [locateTask],
      });

      await runner.flush();

      expect(runner.tasks[0].uiContext?.uiTree).toBeUndefined();
      expect(runner.tasks[0].uiContext?.uiTreeError).toContain(
        'Failed to map captured UI tree to located target',
      );
      expect(runner.tasks[0].uiContext?.uiTreeError).toContain('no node found');
    });

    it('insight - init and append', async () => {
      const initRunner = new TaskRunner('test', fakeUIContextBuilder);
      expect(initRunner.status).toBe('init');
      const tapperFn = rs.fn();

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

    it('carries explicitly registered reference images into dump sidecar metadata', () => {
      const referenceImage = 'data:image/webp;base64,dGVzdA==';
      const runner = new TaskRunner('reference-images', fakeUIContextBuilder, {
        referenceImages: [
          { url: referenceImage },
          { url: referenceImage },
          { url: 'https://example.com/reference.webp' },
        ],
      });

      const dump = runner.dump();
      expect(dump.getReferenceImageUrls()).toEqual([referenceImage]);
      expect(dump.serialize()).not.toContain('referenceImageUrls');
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

      const recoveryExecutor = rs.fn().mockResolvedValue({
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
      const now = rs.spyOn(Date, 'now').mockReturnValue(1_000);
      const uiContextBuilder = rs.fn(fakeUIContextBuilder);
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
      const now = rs.spyOn(Date, 'now').mockReturnValue(1_000);
      const uiContextBuilder = rs.fn(fakeUIContextBuilder);
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
      await expect(runner.append(secondTask)).rejects.toThrow('first-error');

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

    it('keeps task execution errors bounded without a runtime execution graph', async () => {
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
      expect(caughtError?.code).toBe('TASK_EXECUTION_FAILED');
      expect(caughtError?.message).toBe('upstream failed');
      expect(caughtError?.cause).not.toBe(originalError);
      expect(caughtError?.cause).toEqual({
        name: 'Error',
        message: 'upstream failed',
        status: 503,
        requestId: 'request-123',
      });
      expect(caughtError).not.toHaveProperty('runner');
      expect(caughtError).not.toHaveProperty('errorTask');
      expect(runner.latestErrorTask()?.error).toBe(caughtError?.cause);
      expect(runner.latestErrorTask()?.error).not.toBe(originalError);
      expect(caughtError?.task).toEqual({
        taskId: runner.latestErrorTask()?.taskId,
        type: 'Action Space',
        subType: 'Tap',
        status: 'failed',
        errorMessage: 'upstream failed',
      });

      const serializedError = caughtError!.toJSON();
      expect(serializedError).toMatchObject({
        name: 'TaskExecutionError',
        code: 'TASK_EXECUTION_FAILED',
        message: 'upstream failed',
        stack: expect.stringContaining('TaskExecutionError: upstream failed'),
        cause: {
          name: 'Error',
          message: 'upstream failed',
          status: 503,
          requestId: 'request-123',
        },
        task: {
          taskId: caughtError?.task?.taskId,
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
      expect(JSON.stringify({ ...caughtError })).not.toContain('ignoredObject');
    });

    it('preserves the executor stack through the serialized cause', async () => {
      const runner = new TaskRunner(
        'error-stack-serialization-test',
        fakeUIContextBuilder,
      );

      async function failInExecutor() {
        throw new Error('executor failed');
      }

      await runner.append({
        type: 'Action Space',
        subType: 'Tap',
        executor: failInExecutor,
      });

      let caughtError: TaskExecutionError | undefined;
      try {
        await runner.flush();
      } catch (error) {
        caughtError = error as TaskExecutionError;
      }

      expect(caughtError).toBeInstanceOf(TaskExecutionError);
      expect(caughtError?.cause.stack).toContain('failInExecutor');

      const serializedError = caughtError!.toJSON();
      expect(serializedError.stack).toContain('TaskExecutionError');
      expect(serializedError.cause).toMatchObject({
        name: 'Error',
        message: 'executor failed',
        stack: expect.stringContaining('failInExecutor'),
      });
    });

    it('discards message-less payloads before creating public task and error objects', async () => {
      const runner = new TaskRunner(
        'bounded-error-serialization-test',
        fakeUIContextBuilder,
      );
      const originalError = {
        payload: 'x'.repeat(10_000_000),
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

      expect(caughtError?.message).toBe('Error without a message');
      expect(caughtError?.cause).toEqual({
        name: 'Error',
        message: 'Error without a message',
      });
      expect(caughtError?.cause).not.toBe(originalError);
      expect(caughtError).not.toHaveProperty('runner');
      expect(caughtError).not.toHaveProperty('errorTask');
      expect(runner.latestErrorTask()?.error).toBe(caughtError?.cause);
      expect(runner.latestErrorTask()?.error).not.toBe(originalError);
      expect(runner.latestErrorTask()?.errorMessage).toBe(
        'Error without a message',
      );

      const serializedError = caughtError!.toJSON();
      expect(serializedError).toMatchObject({
        name: 'TaskExecutionError',
        code: 'TASK_EXECUTION_FAILED',
        message: 'Error without a message',
        stack: expect.stringContaining(
          'TaskExecutionError: Error without a message',
        ),
        cause: {
          name: 'Error',
          message: 'Error without a message',
        },
        task: {
          taskId: caughtError?.task?.taskId,
          type: 'Action Space',
          subType: 'Tap',
          status: 'failed',
          errorMessage: 'Error without a message',
        },
      });
      const serializedForms = [
        JSON.stringify(caughtError),
        JSON.stringify({ ...caughtError }),
        JSON.stringify(serializedError),
      ];
      for (const serializedText of serializedForms) {
        expect(serializedText.length).toBeLessThan(10_000);
        expect(serializedText).not.toContain('payload');
      }

      expect(caughtError).toBeDefined();
      if (!caughtError) {
        throw new Error('expected TaskRunner.flush() to throw');
      }
      const clonedError = structuredClone(caughtError);
      expect(clonedError.cause).toEqual(caughtError.cause);
      expect(clonedError).not.toHaveProperty('runner');
      expect(clonedError).not.toHaveProperty('errorTask');
      expect(JSON.stringify(clonedError)).not.toContain('payload');
    });

    it('uses a readable fallback when an executor throws an empty string', async () => {
      const runner = new TaskRunner(
        'empty-error-message-test',
        fakeUIContextBuilder,
      );
      await runner.append({
        type: 'Action Space',
        subType: 'Tap',
        executor: async () => {
          throw '';
        },
      });

      await expect(runner.flush()).rejects.toThrow('Empty string thrown');
      expect(runner.latestErrorTask()?.error).toEqual({
        name: 'NonError',
        message: 'Empty string thrown',
      });
      expect(runner.latestErrorTask()?.errorMessage).toBe(
        'Empty string thrown',
      );
    });

    it('bounds every free string in the error and task summary', async () => {
      const runner = new TaskRunner(
        'bounded-task-summary-test',
        fakeUIContextBuilder,
      );
      const longText = 'x'.repeat(10_000);

      await runner.append({
        type: 'Action Space',
        subType: longText,
        thought: longText,
        executor: async () => {
          throw Object.assign(new Error(longText), { code: longText });
        },
      } as ExecutionTaskApply);

      let caughtError: TaskExecutionError | undefined;
      try {
        await runner.flush();
      } catch (error) {
        caughtError = error as TaskExecutionError;
      }

      expect(caughtError).toBeInstanceOf(TaskExecutionError);
      const boundedStrings = [
        caughtError?.message,
        caughtError?.stack,
        caughtError?.cause.message,
        caughtError?.cause.stack,
        caughtError?.cause.code,
        caughtError?.task?.subType,
        caughtError?.task?.thought,
        caughtError?.task?.errorMessage,
      ];
      for (const value of boundedStrings) {
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeLessThanOrEqual(4_096);
      }
      expect(caughtError?.task?.thought).toMatch(/… \[truncated\]$/);
      expect(caughtError?.task?.errorMessage).toMatch(/… \[truncated\]$/);
    });
  },
);
