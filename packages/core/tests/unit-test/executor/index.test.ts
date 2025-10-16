import { Executor } from '@/index';
import type {
  DumpSubscriber,
  ExecutionTaskActionApply,
  ExecutionTaskInsightLocate,
  ExecutionTaskInsightLocateApply,
  InsightDump,
} from '@/index';
import { fakeInsight } from 'tests/utils';
import { describe, expect, it, vi } from 'vitest';

const insightFindTask = (shouldThrow?: boolean) => {
  let insightDump: InsightDump | undefined;
  const dumpCollector: DumpSubscriber = (dump) => {
    insightDump = dump;
  };
  const insight = fakeInsight('test-executor');
  insight.onceDumpUpdatedFn = dumpCollector;

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
      const { element } = await insight.locate(
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
        log: {
          dump: insightDump,
        },
        cache: {
          hit: false,
        },
      };
    },
  };
  return insightFindTask;
};

describe(
  'executor',
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

      const executor = new Executor('test', {
        tasks: inputTasks,
      });
      const flushResult = await executor.flush();
      const tasks = executor.tasks as ExecutionTaskInsightLocate[];
      expect(executor.isInErrorState()).toBeFalsy();
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

      const dump = executor.dump();
      expect(dump.logTime).toBeTruthy();

      expect(flushResult?.output).toBe(flushResultData);
    });

    it('insight - init and append', async () => {
      const initExecutor = new Executor('test');
      expect(initExecutor.status).toBe('init');
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

      initExecutor.append(insightTask1);
      initExecutor.append(actionTask);
      expect(initExecutor.status).toBe('pending');
      expect(initExecutor.tasks.length).toBe(2);
      expect(tapperFn).toBeCalledTimes(0);

      const dumpContent1 = initExecutor.dump();
      expect(dumpContent1.tasks.length).toBe(2);

      // append while running
      const output = await Promise.all([
        initExecutor.flush(),
        (async () => {
          // sleep 200ms
          expect(initExecutor.status).toBe('running');
          await new Promise((resolve) => setTimeout(resolve, 200));
          initExecutor.append(actionTask);
          expect(initExecutor.status).toBe('running');
        })(),
      ]);

      expect(initExecutor.status).toBe('completed');
      expect(initExecutor.tasks.length).toBe(3);
      expect(initExecutor.tasks[2].status).toBe('finished');

      // append while completed
      initExecutor.append(actionTask);
      expect(initExecutor.status).toBe('pending');

      // same dumpPath to append
      const dumpContent2 = initExecutor.dump();
      expect(dumpContent2.tasks.length).toBe(4);

      expect(initExecutor.latestErrorTask()).toBeFalsy();
    });

    it('insight - run with error', async () => {
      const executor = new Executor('test', {
        tasks: [insightFindTask(true), insightFindTask()],
      });
      const r = await executor.flush();
      const tasks = executor.tasks as ExecutionTaskInsightLocate[];

      expect(tasks.length).toBe(2);
      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].error).toBeTruthy();
      expect(tasks[0].timing!.end).toBeTruthy();
      expect(tasks[1].status).toBe('cancelled');
      expect(executor.status).toBe('error');
      expect(executor.latestErrorTask()).toBeTruthy();
      expect(executor.isInErrorState()).toBeTruthy();
      expect(r?.output).toEqual('error-output');

      // expect to throw an error
      await expect(async () => {
        await executor.flush();
      }).rejects.toThrowError();

      await expect(async () => {
        await executor.append(insightFindTask());
      }).rejects.toThrowError();
    });
  },
);
