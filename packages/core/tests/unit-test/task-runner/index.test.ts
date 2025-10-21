import { TaskRunner } from '@/index';
import type {
  ExecutionTaskActionApply,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightLocateApply,
  UIContext,
} from '@/index';
import { fakeInsight } from 'tests/utils';
import { describe, expect, it, vi } from 'vitest';

const insightFindTask = (shouldThrow?: boolean) => {
  const insight = fakeInsight('test-task-runner');

  const insightFindTask: ExecutionTaskInsightLocateApply = {
    type: 'Insight',
    subType: 'Locate',
    param: {
      prompt: 'test',
    },
    locate: null,
    async executor(param, taskContext) {
      if (shouldThrow) {
        const { task } = taskContext;
        task.output = 'error-output';
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('test-error');
      }
      const { element, dump: insightDump } = await insight.locate(
        {
          prompt: param.prompt,
        },
        {},
        {
          modelName: 'mock-model',
          modelDescription: 'mock-model-description',
          intent: 'default',
          from: 'legacy-env',
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

const fakeUIContextBuilder = async () =>
  ({
    screenshotBase64: '',
    tree: { node: null, children: [] },
    size: { width: 0, height: 0 },
  }) as unknown as UIContext;

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
        type: 'Action',
        param: taskParam,
        locate: null,
        executor: tapperFn,
      };
      const actionTask2: ExecutionTaskActionApply = {
        type: 'Action',
        param: taskParam,
        locate: null,
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
      const tasks = runner.tasks as ExecutionTaskInsightLocate[];
      expect(runner.isInErrorState()).toBeFalsy();
      const { element } = tasks[0].output || {};
      expect(element).toBeTruthy();

      expect(tasks.length).toBe(inputTasks.length);
      expect(tasks[0].status).toBe('finished');
      expect(tasks[0].output).toMatchSnapshot();
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
        type: 'Action',
        param: {
          action: 'tap',
          element: 'previous',
        },
        locate: null,
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
      const r = await runner.flush();
      const tasks = runner.tasks as ExecutionTaskInsightLocate[];

      expect(tasks.length).toBe(2);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].error).toBeTruthy();
      expect(tasks[0].timing!.end).toBeTruthy();
      expect(tasks[1].status).toBe('cancelled');
      expect(runner.status).toBe('error');
      expect(runner.latestErrorTask()).toBeTruthy();
      expect(runner.isInErrorState()).toBeTruthy();
      expect(r?.output).toEqual('error-output');

      // expect to throw an error
      await expect(async () => {
        await runner.flush();
      }).rejects.toThrowError();

      await expect(async () => {
        await runner.append(insightFindTask());
      }).rejects.toThrowError();
    });

    it('subTask - reuse previous uiContext', async () => {
      const baseUIContext = (id: string) =>
        ({
          screenshotBase64: id,
          tree: { node: null, children: [] },
          size: { width: 0, height: 0 },
        }) as unknown as UIContext;

      const firstContext = baseUIContext('first');
      const screenshotContext = baseUIContext('screenshot');
      const uiContextBuilder = vi
        .fn<[], Promise<UIContext>>()
        .mockResolvedValueOnce(firstContext)
        .mockResolvedValueOnce(screenshotContext);

      const recordedContexts: UIContext[] = [];

      const runner = new TaskRunner('sub-task-test', uiContextBuilder, {
        tasks: [
          {
            type: 'Action',
            executor: async (_, context) => {
              recordedContexts.push(context.uiContext!);
            },
          },
          {
            type: 'Action',
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
        .mockResolvedValue({
          screenshotBase64: '',
          tree: { node: null, children: [] },
          size: { width: 0, height: 0 },
        } as unknown as UIContext);

      const runner = new TaskRunner('sub-task-error', uiContextBuilder, {
        tasks: [
          {
            type: 'Action',
            subTask: true,
            executor: vi.fn(),
          },
        ],
      });

      await runner.flush();
      expect(runner.status).toBe('error');
      expect(runner.tasks[0].errorMessage).toBe(
        'subTask requires uiContext from previous non-subTask task',
      );
      await expect(async () => {
        await runner.flush();
      }).rejects.toThrowError('task runner is in error state');
    });
  },
);
