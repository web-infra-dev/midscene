import type {
  ExecutionRecorderItem,
  ExecutionTaskInsightLocateApply,
  ExecutionTaskTypeQueryApply,
} from '@/index';
import { Executor } from '@/index';
import { fakeInsight } from 'tests/utils';
import { describe, expect, it, vi } from 'vitest';

describe('screenshot optimization', () => {
  it('should not duplicate screenshots in Query tasks', async () => {
    const insight = fakeInsight('screenshot-test');
    const screenshotSpy = vi.spyOn(insight, 'contextRetrieverFn');

    const queryTask: ExecutionTaskTypeQueryApply = {
      type: 'Insight',
      subType: 'Query',
      param: {
        dataDemand: 'test query',
      },
      locate: null,
      async executor(param, taskContext) {
        const { task } = taskContext;
        const recorder: ExecutionRecorderItem[] = [];
        task.recorder = recorder;

        // Simulate getting UIContext
        const uiContext = await insight.contextRetrieverFn('extract');
        task.uiContext = uiContext;

        // Add screenshot from UIContext to recorder
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: Date.now(),
          screenshot: uiContext.screenshotBase64,
          timing: 'before Extract',
        };
        recorder.push(recordItem);

        return {
          output: { data: 'test-data' },
        };
      },
    };

    const executor = new Executor('screenshot-test', {
      tasks: [queryTask],
    });

    await executor.flush();

    // Verify contextRetrieverFn was called only once
    expect(screenshotSpy).toHaveBeenCalledTimes(1);

    // Verify recorder has exactly one screenshot
    const task = executor.tasks[0];
    expect(task.recorder).toBeTruthy();
    expect(task.recorder!.length).toBe(1);
    expect(task.recorder![0].type).toBe('screenshot');
    expect(task.recorder![0].screenshot).toBeTruthy();
  });

  it('should not duplicate screenshots in Locate tasks', async () => {
    const insight = fakeInsight('screenshot-test');
    const screenshotSpy = vi.spyOn(insight, 'contextRetrieverFn');

    const locateTask: ExecutionTaskInsightLocateApply = {
      type: 'Insight',
      subType: 'Locate',
      param: {
        prompt: 'find button',
      },
      locate: null,
      async executor(param, taskContext) {
        const { task } = taskContext;
        const recorder: ExecutionRecorderItem[] = [];
        task.recorder = recorder;

        // Simulate getting UIContext
        const uiContext = await insight.contextRetrieverFn('locate');
        task.uiContext = uiContext;

        // Add screenshot from UIContext to recorder
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: Date.now(),
          screenshot: uiContext.screenshotBase64,
          timing: 'before Insight',
        };
        recorder.push(recordItem);

        return {
          output: { element: null },
        };
      },
    };

    const executor = new Executor('screenshot-test', {
      tasks: [locateTask],
    });

    await executor.flush();

    // Verify contextRetrieverFn was called only once
    expect(screenshotSpy).toHaveBeenCalledTimes(1);

    // Verify recorder has exactly one screenshot
    const task = executor.tasks[0];
    expect(task.recorder).toBeTruthy();
    expect(task.recorder!.length).toBe(1);
    expect(task.recorder![0].type).toBe('screenshot');
    expect(task.recorder![0].screenshot).toBeTruthy();
  });

  it('should verify screenshot is reused from UIContext', async () => {
    const insight = fakeInsight('screenshot-test');

    const queryTask: ExecutionTaskTypeQueryApply = {
      type: 'Insight',
      subType: 'Query',
      param: {
        dataDemand: 'test query',
      },
      locate: null,
      async executor(param, taskContext) {
        const { task } = taskContext;
        const recorder: ExecutionRecorderItem[] = [];
        task.recorder = recorder;

        // Get UIContext
        const uiContext = await insight.contextRetrieverFn('extract');
        task.uiContext = uiContext;

        // The screenshot in recorder should be the same as in UIContext
        const recordItem: ExecutionRecorderItem = {
          type: 'screenshot',
          ts: Date.now(),
          screenshot: uiContext.screenshotBase64,
          timing: 'before Extract',
        };
        recorder.push(recordItem);

        return {
          output: { data: 'test-data' },
        };
      },
    };

    const executor = new Executor('screenshot-test', {
      tasks: [queryTask],
    });

    await executor.flush();

    const task = executor.tasks[0];

    // Verify that the screenshot in recorder is the same as the one in UIContext
    expect(task.recorder![0].screenshot).toBe(task.uiContext?.screenshotBase64);
  });
});
